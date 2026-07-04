/**
 * Unit tests for extension/utils/telemetry-collector.js.
 *
 * Phase 272 / v0.9.69. Validates the 10 behaviour sections per CONTEXT.md
 * decisions/Tests + BEAT-01..10.
 *
 * Test sections (in order):
 *   1. Beat aggregation: 5 fsbUsageData rows in window with 2 distinct
 *      (client, model) tuples -> 2 events emitted, tokens summed per group.
 *   2. Watermark advancement: 3 sequential flushes don't re-process rows
 *      older than fsbTelemetryLastBeatTs; watermark advances each time.
 *   3. Queue FIFO cap: enqueueing 250 events -> queue contains 200
 *      (oldest 50 dropped).
 *   4. Stale drop on load: events with ts_minute < Date.now()-24h removed
 *      on flush start.
 *   5. Opt-out short-circuit: fsbTelemetryOptOut=true -> next flush clears
 *      queue, fetch shim is NOT called.
 *   6. Install announce timing: explicit enqueue({event_type:'install_announce'})
 *      -> queue gains exactly 1 event with event_type='install_announce'
 *      and 9 fields present, defaults applied.
 *   7. Retry cap: 5 server-failure POSTs -> 5th attempt's events dropped on
 *      the 6th flush.
 *   8. Active agent count: fsbActiveAgentsCount=3 -> emitted event has
 *      active_agent_count=3; missing/non-numeric/negative -> 0.
 *   9. Allowlist gate (RUNTIME): emitted event has EXACTLY 9 keys.
 *  10. SW eviction race: two concurrent flush() calls do not double-POST
 *      (flushLock serialization).
 *
 * Run: node tests/telemetry-collector.test.js
 *
 * Test harness pattern matches tests/mcp-metrics-recorder.test.js: plain Node
 * script, no external framework, in-memory chrome.storage.local shim, fetch
 * shim that records calls and returns canned responses.
 */

'use strict';

const path = require('path');

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
  // Reset module-level global from any previous require so each test
  // starts with a clean fsbTelemetryCollector.
  delete globalThis.fsbTelemetryCollector;
  return require(COLLECTOR_PATH);
}

// In-memory chrome.storage.local shim. Each test resets _store. Mirror of
// tests/mcp-metrics-recorder.test.js makeShim().
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

// Fetch shim records every call. Each test pushes canned responses to
// _responses (FIFO); empty queue defaults to a 200 OK so basic tests don't
// have to enumerate every call.
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

// Identity shim. Returns a fixed UUID + configurable opt-out.
function makeIdentityShim(optOut) {
  return {
    _optOut: !!optOut,
    async getOrCreateInstallUuid() { return 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; },
    async isTelemetryOptedOut() { return this._optOut; }
  };
}

// Wire all shims into the freshly-required module.
function wireShims(mod, storage, fetchShim, identity) {
  mod._setStorageShim(storage);
  mod._setFetchShim(fetchShim.fetch);
  mod._setIdentityShim(identity);
}

(async function runTests() {

  // -------------------------------------------------------------------------
  // Section 1: Beat aggregation (5 rows, 2 distinct (client, model) tuples)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 1: Beat aggregation (5 rows -> 2 groups) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    // Seed 5 fsbUsageData rows: 3 with (claude-code, claude-opus-4-7), 2 with
    // (codex, gpt-5). All within the watermark window (watermark = 0 default).
    const now = Date.now();
    storage._store.fsbUsageData = [
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 100, tokens_out: 50, ts: now - 10 },
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 200, tokens_out: 80, ts: now - 9 },
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 50,  tokens_out: 20, ts: now - 8 },
      { source: 'mcp', client: 'codex',       model: 'gpt-5',           tokens_in: 300, tokens_out: 150, ts: now - 7 },
      { source: 'mcp', client: 'codex',       model: 'gpt-5',           tokens_in: 150, tokens_out: 75,  ts: now - 6 },
      // Non-MCP row -- must be ignored
      { source: 'ai-provider', model: 'gpt-5', inputTokens: 999, outputTokens: 999, timestamp: now }
    ];
    storage._store.fsbActiveAgentsCount = 0;

    await m.flush();

    // After flush: POSTed snapshot, queue should be empty. Inspect the
    // POST body.
    passAssertEqual(fetchShim._calls.length, 1, 'exactly one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssert(body && Array.isArray(body.events), 'POST body has events array');
    passAssertEqual(body.events.length, 2, '2 events (one per (client, model) group)');

    // Find groups by mcp_client (insertion order in object iteration is
    // generally deterministic for string keys in V8, but we sort to be
    // robust).
    const events = body.events.slice().sort((a, b) => a.mcp_client.localeCompare(b.mcp_client));
    const claudeEv = events.find(e => e.mcp_client === 'claude-code');
    const codexEv = events.find(e => e.mcp_client === 'codex');

    passAssert(claudeEv && codexEv, 'both groups emitted');
    passAssertEqual(claudeEv.mcp_client, 'claude-code', 'claude group client');
    passAssertEqual(claudeEv.model, 'claude-opus-4-7', 'claude group model');
    passAssertEqual(claudeEv.tokens_in, 350, 'claude tokens_in summed: 100+200+50 = 350');
    passAssertEqual(claudeEv.tokens_out, 150, 'claude tokens_out summed: 50+80+20 = 150');
    passAssertEqual(codexEv.mcp_client, 'codex', 'codex group client');
    passAssertEqual(codexEv.model, 'gpt-5', 'codex group model');
    passAssertEqual(codexEv.tokens_in, 450, 'codex tokens_in summed: 300+150 = 450');
    passAssertEqual(codexEv.tokens_out, 225, 'codex tokens_out summed: 150+75 = 225');
    passAssertEqual(claudeEv.event_type, 'periodic', 'event_type is "periodic"');

    // Non-MCP row was ignored
    passAssert(!events.some(e => e.tokens_in === 999), 'AI-provider row not included');
  }

  // -------------------------------------------------------------------------
  // Section 2: Watermark advancement (3 sequential flushes)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 2: Watermark advancement ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    const t0 = Date.now();
    // Seed initial rows older than the first flush's "now".
    storage._store.fsbUsageData = [
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 10, tokens_out: 5, ts: t0 - 1000 },
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 20, tokens_out: 10, ts: t0 - 500 }
    ];

    // Flush #1: both rows aggregated -> one event POSTed.
    await m.flush();
    passAssertEqual(fetchShim._calls.length, 1, 'flush #1 issued a POST');
    const wm1 = storage._store.fsbTelemetryLastBeatTs;
    passAssert(typeof wm1 === 'number' && wm1 >= t0,
      'watermark advanced past initial seed time (got ' + wm1 + ', t0=' + t0 + ')');

    // Flush #2 with NO new rows: PRESENCE-01 heartbeat fires (idle install)
    // so the POST count advances by 1; the POSTed event is the heartbeat
    // (mcp_client='unknown', zero tokens), NOT a re-aggregation of the
    // already-watermarked rows. Watermark still advances.
    await m.flush();
    passAssertEqual(fetchShim._calls.length, 2,
      'flush #2 issued a heartbeat POST (PRESENCE-01: idle install, no MCP rows)');
    const heartbeatBody = fetchShim._calls[1].init.body;
    passAssertEqual(heartbeatBody.events.length, 1,
      'flush #2 heartbeat POST contains exactly ONE event');
    passAssertEqual(heartbeatBody.events[0].mcp_client, 'unknown',
      'flush #2 heartbeat carries mcp_client=unknown (proof it is the heartbeat, not re-aggregation)');
    passAssertEqual(heartbeatBody.events[0].tokens_in, 0,
      'flush #2 heartbeat carries tokens_in=0');
    const wm2 = storage._store.fsbTelemetryLastBeatTs;
    passAssert(typeof wm2 === 'number' && wm2 >= wm1, 'watermark advanced again on flush #2');

    // Flush #3 after adding a NEW row beyond watermark: aggregates only the
    // new row, heartbeat does NOT fire (agg.groups.length === 1).
    storage._store.fsbUsageData.push({
      source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 999, tokens_out: 111, ts: Date.now() + 100
    });
    await m.flush();
    passAssertEqual(fetchShim._calls.length, 3, 'flush #3 issued a POST for the new row');
    const body3 = fetchShim._calls[2].init.body;
    passAssertEqual(body3.events.length, 1, 'flush #3 emitted exactly one event');
    passAssertEqual(body3.events[0].tokens_in, 999, 'flush #3 picked up only the new row (tokens_in=999)');
    passAssertEqual(body3.events[0].tokens_out, 111, 'flush #3 picked up only the new row (tokens_out=111)');
    passAssertEqual(body3.events[0].mcp_client, 'claude-code',
      'flush #3 event is the aggregated row, not a heartbeat');
  }

  // -------------------------------------------------------------------------
  // Section 3: Queue FIFO cap (250 enqueues -> 200 retained)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 3: Queue FIFO cap (250 -> 200, drop oldest 50) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    storage._store.fsbActiveAgentsCount = 0;

    // Enqueue 250 install_announce events (won't POST until flush). We tag
    // each with a synthetic mcp_client we can identify post-cap.
    for (let i = 0; i < 250; i++) {
      await m.enqueue({
        event_type: 'install_announce',
        mcp_client: 'tag-' + i,
        model: 'unknown',
        tokens_in: i,
        tokens_out: 0
      });
    }

    const pending = await m.getPendingCount();
    passAssertEqual(pending, 200, 'after 250 enqueues, queue has 200 entries');

    // The 50 OLDEST should have been dropped -> the surviving 200 should be
    // tag-50 ... tag-249.
    const queue = storage._store.fsbTelemetryQueue;
    passAssert(Array.isArray(queue) && queue.length === 200, 'persisted queue has 200 entries');
    passAssertEqual(queue[0].mcp_client, 'tag-50', 'oldest surviving is tag-50 (tag-0..tag-49 dropped)');
    passAssertEqual(queue[queue.length - 1].mcp_client, 'tag-249', 'newest is tag-249');
  }

  // -------------------------------------------------------------------------
  // Section 4: Stale drop on load (events older than 24h removed)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 4: Stale drop (24h boundary) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    const now = Date.now();
    const TWENTY_FIVE_HOURS_AGO = now - (25 * 60 * 60 * 1000);
    const ONE_HOUR_AGO = now - (60 * 60 * 1000);

    // Pre-seed queue: 3 stale events + 2 fresh events. After flush start,
    // stale events should be filtered out BEFORE aggregation runs.
    storage._store.fsbTelemetryQueue = [
      { event_id: 's1', install_uuid: 'x', ts_minute: TWENTY_FIVE_HOURS_AGO, mcp_client: 'old', model: 'old', tokens_in: 0, tokens_out: 0, active_agent_count: 0, event_type: 'periodic' },
      { event_id: 's2', install_uuid: 'x', ts_minute: TWENTY_FIVE_HOURS_AGO, mcp_client: 'old', model: 'old', tokens_in: 0, tokens_out: 0, active_agent_count: 0, event_type: 'periodic' },
      { event_id: 's3', install_uuid: 'x', ts_minute: TWENTY_FIVE_HOURS_AGO, mcp_client: 'old', model: 'old', tokens_in: 0, tokens_out: 0, active_agent_count: 0, event_type: 'periodic' },
      { event_id: 'f1', install_uuid: 'x', ts_minute: ONE_HOUR_AGO, mcp_client: 'fresh1', model: 'fresh1', tokens_in: 11, tokens_out: 22, active_agent_count: 0, event_type: 'periodic' },
      { event_id: 'f2', install_uuid: 'x', ts_minute: ONE_HOUR_AGO, mcp_client: 'fresh2', model: 'fresh2', tokens_in: 33, tokens_out: 44, active_agent_count: 0, event_type: 'periodic' }
    ];
    // No new fsbUsageData rows; only queue flush.
    storage._store.fsbUsageData = [];

    await m.flush();

    // The POST should contain ONLY the 2 fresh events (stale dropped). Quick
    // task 260524-8qv (Codex PR #78 Finding 2, P2) tightened the heartbeat
    // guard to `agg.groups.length === 0 && queue.length === 0`, so a non-
    // empty queue (the 2 fresh events here) suppresses the heartbeat. The
    // retried events' own POST already triggers server-side recordSeen() for
    // this install_uuid, so the heartbeat would be telemetry-loss for nothing.
    passAssertEqual(fetchShim._calls.length, 1, 'one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssertEqual(body.events.length, 2,
      '2 events in POST body (2 fresh from queue, NO heartbeat -- 260524-8qv Finding 2 suppression)');
    // Stale events ('s1','s2','s3') must be absent. Fresh ('f1','f2') must be
    // present. NO heartbeat (suppressed by 260524-8qv when queue is non-empty).
    const ids = body.events.map(e => e.event_id);
    passAssert(ids.includes('f1'), 'fresh event_id "f1" preserved');
    passAssert(ids.includes('f2'), 'fresh event_id "f2" preserved');
    passAssert(!ids.includes('s1') && !ids.includes('s2') && !ids.includes('s3'),
      'stale event_ids s1/s2/s3 removed');
    const heartbeatEv = body.events.find(e => e.mcp_client === 'unknown' && e.event_type === 'periodic');
    passAssert(!heartbeatEv,
      'NO PRESENCE-01 heartbeat in POST -- queue.length > 0 suppresses heartbeat per 260524-8qv Finding 2');
    // Queue should be empty after successful POST.
    const after = await m.getPendingCount();
    passAssertEqual(after, 0, 'queue empty after successful POST');
  }

  // -------------------------------------------------------------------------
  // Section 5: Opt-out short-circuit
  // -------------------------------------------------------------------------
  console.log('\n--- Section 5: Opt-out short-circuit ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(true); // opted OUT
    wireShims(m, storage, fetchShim, identity);

    // Pre-seed queue with a real event AND fsbUsageData with new rows -- both
    // must be discarded.
    const now = Date.now();
    storage._store.fsbTelemetryQueue = [
      { event_id: 'q1', install_uuid: 'x', ts_minute: now, mcp_client: 'claude-code', model: 'm', tokens_in: 1, tokens_out: 2, active_agent_count: 0, event_type: 'periodic' }
    ];
    storage._store.fsbUsageData = [
      { source: 'mcp', client: 'claude-code', model: 'm', tokens_in: 99, tokens_out: 99, ts: now }
    ];

    let didThrow = false;
    try { await m.flush(); } catch (_e) { didThrow = true; }
    passAssertEqual(didThrow, false, 'opted-out flush did NOT throw');

    passAssertEqual(fetchShim._calls.length, 0, 'no POST issued when opted out');

    // Queue should be cleared.
    const after = await m.getPendingCount();
    passAssertEqual(after, 0, 'queue cleared by opt-out flush');
    const queue = storage._store.fsbTelemetryQueue;
    passAssert(Array.isArray(queue) && queue.length === 0, 'persisted queue is empty array');
  }

  // -------------------------------------------------------------------------
  // Section 6: install_announce event shape
  // -------------------------------------------------------------------------
  console.log('\n--- Section 6: install_announce event shape ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    storage._store.fsbActiveAgentsCount = 0;

    await m.enqueue({ event_type: 'install_announce' });

    const queue = storage._store.fsbTelemetryQueue;
    passAssert(Array.isArray(queue) && queue.length === 1, 'queue has exactly 1 event');
    const ev = queue[0];

    passAssertEqual(ev.event_type, 'install_announce', 'event_type is install_announce');
    passAssertEqual(ev.mcp_client, 'unknown', 'default mcp_client = unknown');
    passAssertEqual(ev.model, 'unknown', 'default model = unknown');
    passAssertEqual(ev.tokens_in, 0, 'default tokens_in = 0');
    passAssertEqual(ev.tokens_out, 0, 'default tokens_out = 0');
    passAssertEqual(ev.active_agent_count, 0, 'default active_agent_count = 0');
    passAssertEqual(ev.install_uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'install_uuid resolved from identity shim');
    passAssert(typeof ev.event_id === 'string' && ev.event_id.length > 0, 'event_id minted at enqueue time');
    passAssert(typeof ev.ts_minute === 'number' && ev.ts_minute > 0, 'ts_minute computed');
    passAssertEqual(ev.ts_minute % 60000, 0, 'ts_minute floors to one-minute resolution');

    // Allowlist check: the event has EXACTLY 9 keys.
    const keys = Object.keys(ev).sort();
    passAssertDeepEqual(keys, [
      'active_agent_count',
      'event_id',
      'event_type',
      'install_uuid',
      'mcp_client',
      'model',
      'tokens_in',
      'tokens_out',
      'ts_minute'
    ], 'event has EXACTLY the 9 allowlisted keys');
  }

  // -------------------------------------------------------------------------
  // Section 7: Retry cap (5 failed POSTs -> drop on 6th flush)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 7: Retry cap (5 failed POSTs drop on 6th flush) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    storage._store.fsbActiveAgentsCount = 0;

    // PRESENCE-01 NOTE: with the heartbeat block in _runFlush(), every flush
    // that sees agg.groups.length === 0 enqueues an additional 'periodic'
    // heartbeat. To keep this test focused on the retry-cap behaviour of the
    // SPECIFIC install_announce event, we seed an MCP row before EACH flush
    // with a fresh ts > the prior watermark, which suppresses the heartbeat
    // (agg.groups.length === 1). Each flush then carries the install_announce
    // event + 1 aggregated row event, all of which share the same retry-cap
    // lifecycle on 500-response retries.
    const baseTs = Date.now();

    // Pre-seed one event via enqueue, then run 5 flushes each returning 500.
    await m.enqueue({ event_type: 'install_announce' });
    passAssertEqual(await m.getPendingCount(), 1, 'queue has 1 event pre-retry');

    // Queue 5 server-failure responses, then a 6th (which shouldn't be hit
    // because the event will be dropped on flush #6's attempts-cap pass).
    fetchShim._responses.push({ ok: false, status: 500 });
    fetchShim._responses.push({ ok: false, status: 500 });
    fetchShim._responses.push({ ok: false, status: 500 });
    fetchShim._responses.push({ ok: false, status: 500 });
    fetchShim._responses.push({ ok: false, status: 500 });

    // Flush 5 times. Each bumps attempts; after 5 attempts events at cap are
    // dropped on flush #6. Before each flush, push a fresh-timestamped MCP
    // row so the heartbeat block stays dormant (agg.groups.length === 1).
    storage._store.fsbUsageData = [];
    for (let i = 1; i <= 5; i++) {
      storage._store.fsbUsageData.push({
        source: 'mcp', client: 'retry-client', model: 'retry-model',
        tokens_in: 0, tokens_out: 0, ts: baseTs + i
      });
      await m.flush();
    }
    passAssertEqual(fetchShim._calls.length, 5, '5 POST attempts made');
    // Queue should still contain the install_announce event at attempts=5.
    // (The aggregated row from each flush is ALSO in the queue with its own
    // attempts counter; the install_announce has the highest attempts since
    // it has been retried since flush #1.)
    const queueBefore6 = storage._store.fsbTelemetryQueue || [];
    const installAnnounceEv = queueBefore6.find(e => e.event_type === 'install_announce');
    passAssert(installAnnounceEv, 'install_announce event still in queue (attempts=5)');
    passAssertEqual(installAnnounceEv.attempts, 5,
      'install_announce attempts counter at cap (5) after 5 failed POSTs');

    // Flush #6: attempts cap drops events at >=5 BEFORE any POST is attempted.
    // The install_announce (attempts=5) is dropped. Aggregated retry events
    // with lower attempts survive and a fresh row triggers another aggregated
    // event for this flush -> POST does fire (with whatever still qualifies).
    storage._store.fsbUsageData.push({
      source: 'mcp', client: 'retry-client', model: 'retry-model',
      tokens_in: 0, tokens_out: 0, ts: baseTs + 100
    });
    await m.flush();
    // Confirm install_announce is gone (the attempts-cap drop happened).
    const queueAfter6 = storage._store.fsbTelemetryQueue || [];
    const installAnnounceStillThere = queueAfter6.find(e => e.event_type === 'install_announce');
    passAssert(!installAnnounceStillThere,
      'install_announce event dropped on 6th flush (attempts >= MAX)');
  }

  // -------------------------------------------------------------------------
  // Section 8: Active agent count default/coercion
  // -------------------------------------------------------------------------
  console.log('\n--- Section 8: Active agent count default/coercion ---');
  {
    // 8a: explicit value 3
    {
      const m = freshRequire();
      const storage = makeShim();
      const fetchShim = makeFetchShim();
      const identity = makeIdentityShim(false);
      wireShims(m, storage, fetchShim, identity);
      storage._store.fsbActiveAgentsCount = 3;
      await m.enqueue({ event_type: 'install_announce' });
      const ev = storage._store.fsbTelemetryQueue[0];
      passAssertEqual(ev.active_agent_count, 3, 'fsbActiveAgentsCount=3 -> event.active_agent_count=3');
    }
    // 8b: missing key -> 0
    {
      const m = freshRequire();
      const storage = makeShim();
      const fetchShim = makeFetchShim();
      const identity = makeIdentityShim(false);
      wireShims(m, storage, fetchShim, identity);
      // Do NOT set fsbActiveAgentsCount.
      await m.enqueue({ event_type: 'install_announce' });
      const ev = storage._store.fsbTelemetryQueue[0];
      passAssertEqual(ev.active_agent_count, 0, 'missing key -> active_agent_count=0');
    }
    // 8c: non-numeric -> 0
    {
      const m = freshRequire();
      const storage = makeShim();
      const fetchShim = makeFetchShim();
      const identity = makeIdentityShim(false);
      wireShims(m, storage, fetchShim, identity);
      storage._store.fsbActiveAgentsCount = 'not-a-number';
      await m.enqueue({ event_type: 'install_announce' });
      const ev = storage._store.fsbTelemetryQueue[0];
      passAssertEqual(ev.active_agent_count, 0, 'non-numeric -> active_agent_count=0');
    }
    // 8d: negative -> 0
    {
      const m = freshRequire();
      const storage = makeShim();
      const fetchShim = makeFetchShim();
      const identity = makeIdentityShim(false);
      wireShims(m, storage, fetchShim, identity);
      storage._store.fsbActiveAgentsCount = -7;
      await m.enqueue({ event_type: 'install_announce' });
      const ev = storage._store.fsbTelemetryQueue[0];
      passAssertEqual(ev.active_agent_count, 0, 'negative -> active_agent_count=0');
    }
    // 8e: float -> floor
    {
      const m = freshRequire();
      const storage = makeShim();
      const fetchShim = makeFetchShim();
      const identity = makeIdentityShim(false);
      wireShims(m, storage, fetchShim, identity);
      storage._store.fsbActiveAgentsCount = 4.7;
      await m.enqueue({ event_type: 'install_announce' });
      const ev = storage._store.fsbTelemetryQueue[0];
      passAssertEqual(ev.active_agent_count, 4, 'float 4.7 -> active_agent_count=4 (floor)');
    }
  }

  // -------------------------------------------------------------------------
  // Section 9: Runtime allowlist gate (every emitted event has 9 keys exactly)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 9: Runtime allowlist gate (9 keys exactly) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    const now = Date.now();
    // Inject rows with PII-shaped fields that the collector MUST NOT copy.
    storage._store.fsbUsageData = [
      {
        source: 'mcp',
        client: 'claude-code',
        model: 'claude-opus-4-7',
        tokens_in: 10,
        tokens_out: 5,
        ts: now,
        // These three fields are present on Phase 271 rows but MUST NOT
        // appear in the beat payload.
        tool: 'click',
        cost_usd: 0.001,
        pricing_confidence: 'fallback',
        token_source: 'estimate'
      }
    ];
    storage._store.fsbActiveAgentsCount = 1;

    await m.flush();
    passAssertEqual(fetchShim._calls.length, 1, 'one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssertEqual(body.events.length, 1, 'one event emitted');
    const ev = body.events[0];

    const keys = Object.keys(ev).sort();
    const expected = [
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
    passAssertDeepEqual(keys, expected, 'event has EXACTLY 9 allowlisted keys');

    // Explicit negation: NONE of the banned row-derived fields appear.
    const banned = ['tool', 'cost_usd', 'pricing_confidence', 'token_source', 'ts', 'source', 'client'];
    for (const b of banned) {
      passAssert(!(b in ev), 'event does NOT include banned field "' + b + '"');
    }
  }

  // -------------------------------------------------------------------------
  // Section 10: SW eviction race (two concurrent flush calls -> one POST)
  // -------------------------------------------------------------------------
  console.log('\n--- Section 10: SW eviction race (concurrent flush serialization) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    const now = Date.now();
    // One MCP row -> one event will be enqueued by aggregation.
    storage._store.fsbUsageData = [
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7', tokens_in: 100, tokens_out: 50, ts: now }
    ];
    storage._store.fsbActiveAgentsCount = 0;

    // Fire two flush() invocations close together. _flushLock serializes
    // them so the SECOND flush sees: watermark already advanced, queue
    // already cleared after the FIRST flush's successful POST. With
    // PRESENCE-01 the SECOND flush ALSO sees agg.groups.length === 0 (the
    // seeded row was consumed and watermarked) so it enqueues a heartbeat
    // and POSTs it. Total: 2 POSTs (1 aggregated + 1 heartbeat), still
    // strictly serialized -- the flushLock invariant is unchanged.
    await Promise.all([m.flush(), m.flush()]);

    passAssertEqual(fetchShim._calls.length, 2,
      'two concurrent flush() calls produce TWO serialized POSTs (aggregated + heartbeat)');
    // First POST: the aggregated row.
    const body = fetchShim._calls[0].init.body;
    passAssertEqual(body.events.length, 1, 'single event in the first (aggregated) POST');
    passAssertEqual(body.events[0].tokens_in, 100, 'event carries the single row tokens_in=100');
    passAssertEqual(body.events[0].mcp_client, 'claude-code',
      'first POST is the aggregated row (mcp_client=claude-code)');
    // Second POST: PRESENCE-01 heartbeat (second flush saw no MCP rows).
    const body2 = fetchShim._calls[1].init.body;
    passAssertEqual(body2.events.length, 1, 'single event in the second (heartbeat) POST');
    passAssertEqual(body2.events[0].mcp_client, 'unknown',
      'second POST is the PRESENCE-01 heartbeat (mcp_client=unknown)');
    passAssertEqual(body2.events[0].tokens_in, 0, 'heartbeat carries tokens_in=0');

    // Queue should be empty after both POSTs succeed.
    const queueAfter = await m.getPendingCount();
    passAssertEqual(queueAfter, 0, 'queue empty after race resolved');
  }

  // -------------------------------------------------------------------------
  // Section 11: Presence heartbeat (idle install emits one zero-valued
  //             'periodic' event so /stats active_users_now sees the install)
  //
  // Locks the three invariants of PRESENCE-01 (quick task 260524-62w):
  //   11.a -- No MCP activity + empty queue -> exactly ONE heartbeat POSTed,
  //           shape locked (mcp_client='unknown', tokens_in=0, tokens_out=0,
  //           event_type='periodic', active_agent_count from storage).
  //   11.b -- >=1 MCP groups -> NO extra heartbeat appended. POST event count
  //           equals agg.groups.length (NOT agg.groups.length + 1).
  //   11.c -- Opted-out + no MCP activity -> NO heartbeat AND no POST -- the
  //           BEAT-07 short-circuit beats the heartbeat code path.
  // -------------------------------------------------------------------------

  // 11.a -- No MCP rows + empty queue -> exactly one heartbeat POSTed.
  console.log('\n--- Section 11.a: heartbeat fires when idle + queue empty ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    // No fsbUsageData rows at all (agg.groups.length === 0). No pre-seeded
    // queue. active-agent count = 2 to prove the heartbeat carries the
    // resolved value (and to differentiate from the default-0 case).
    storage._store.fsbUsageData = [];
    storage._store.fsbActiveAgentsCount = 2;

    await m.flush();

    passAssertEqual(fetchShim._calls.length, 1, '11.a: exactly one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssert(body && Array.isArray(body.events), '11.a: POST body has events array');
    passAssertEqual(body.events.length, 1, '11.a: POST contains exactly ONE event (the heartbeat)');

    const ev = body.events[0];
    passAssertEqual(ev.event_type, 'periodic', '11.a: heartbeat event_type is "periodic"');
    passAssertEqual(ev.mcp_client, 'unknown', '11.a: heartbeat mcp_client is "unknown"');
    passAssertEqual(ev.tokens_in, 0, '11.a: heartbeat tokens_in is 0');
    passAssertEqual(ev.tokens_out, 0, '11.a: heartbeat tokens_out is 0');
    passAssertEqual(ev.active_agent_count, 2, '11.a: heartbeat carries resolved active_agent_count');
    passAssertEqual(ev.install_uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '11.a: heartbeat install_uuid resolved from identity shim');
    passAssert(typeof ev.event_id === 'string' && ev.event_id.length > 0,
      '11.a: heartbeat event_id minted (UUIDv4 by _mintEventId)');
    passAssert(typeof ev.ts_minute === 'number' && ev.ts_minute > 0,
      '11.a: heartbeat ts_minute computed');
    passAssertEqual(ev.ts_minute % 60000, 0, '11.a: heartbeat ts_minute floors to 1-min resolution');

    // _buildEvent normalizes model. When the caller passes null, _buildEvent's
    // current behavior (line 270..322 of telemetry-collector.js) defaults to
    // 'unknown'. The server allows 'unknown' as a regular string label; the
    // model is NOT enumerated, only length-capped. Either 'unknown' or null
    // would validate, but the runtime behavior is the 'unknown' default --
    // lock it so a future _buildEvent refactor that flips this default does
    // not silently change the wire shape.
    passAssertEqual(ev.model, 'unknown',
      '11.a: heartbeat model normalized to "unknown" by _buildEvent default');

    // Allowlist check: heartbeat carries EXACTLY the 9 keys (no leakage).
    const keys = Object.keys(ev).sort();
    passAssertDeepEqual(keys, [
      'active_agent_count',
      'event_id',
      'event_type',
      'install_uuid',
      'mcp_client',
      'model',
      'tokens_in',
      'tokens_out',
      'ts_minute'
    ], '11.a: heartbeat has EXACTLY the 9 allowlisted keys');

    // After successful POST, queue is empty (heartbeat was sent and cleared).
    const pendingAfter = await m.getPendingCount();
    passAssertEqual(pendingAfter, 0, '11.a: queue empty after heartbeat POST succeeds');
  }

  // 11.b -- >=1 aggregated groups -> NO extra heartbeat appended.
  console.log('\n--- Section 11.b: heartbeat does NOT double-emit when aggregation produced events ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    const now = Date.now();
    // Two MCP rows -> ONE aggregated group (same client+model). Heartbeat
    // must NOT add a second event on top.
    storage._store.fsbUsageData = [
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7',
        tokens_in: 100, tokens_out: 50, ts: now - 10 },
      { source: 'mcp', client: 'claude-code', model: 'claude-opus-4-7',
        tokens_in: 200, tokens_out: 80, ts: now - 5 }
    ];
    storage._store.fsbActiveAgentsCount = 1;

    await m.flush();

    passAssertEqual(fetchShim._calls.length, 1, '11.b: exactly one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssertEqual(body.events.length, 1,
      '11.b: POST has exactly ONE event (the aggregated group), NOT 2');

    const ev = body.events[0];
    // Confirm the surviving event is the AGGREGATED group (not the heartbeat).
    // Distinguishing field: aggregated group has the real mcp_client value
    // ('claude-code'), heartbeat would have 'unknown'.
    passAssertEqual(ev.mcp_client, 'claude-code',
      '11.b: surviving event is the aggregated group, not the heartbeat (mcp_client=claude-code)');
    passAssertEqual(ev.tokens_in, 300, '11.b: aggregated tokens_in = 100+200 = 300');
    passAssertEqual(ev.tokens_out, 130, '11.b: aggregated tokens_out = 50+80 = 130');
    // Negative assertion: NO event with mcp_client='unknown' snuck through.
    const heartbeatLeaked = body.events.some(e => e.mcp_client === 'unknown');
    passAssert(!heartbeatLeaked,
      '11.b: NO heartbeat event with mcp_client="unknown" leaked into the POST');
  }

  // 11.c -- Opted-out install -> NO heartbeat AND no POST (BEAT-07 wins).
  console.log('\n--- Section 11.c: opt-out short-circuit beats the heartbeat (no POST at all) ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(true); // opted OUT
    wireShims(m, storage, fetchShim, identity);

    // No MCP rows -> agg.groups.length === 0. If BEAT-07 did NOT fire first,
    // the heartbeat block would enqueue and POST. We assert NEITHER happens.
    storage._store.fsbUsageData = [];
    storage._store.fsbActiveAgentsCount = 0;

    let didThrow = false;
    try { await m.flush(); } catch (_e) { didThrow = true; }
    passAssertEqual(didThrow, false, '11.c: opted-out flush did NOT throw');

    passAssertEqual(fetchShim._calls.length, 0,
      '11.c: NO POST issued -- BEAT-07 opt-out short-circuit fires before the heartbeat code');

    // Queue should be empty (BEAT-07 writes [] on every opted-out flush).
    const pendingAfter = await m.getPendingCount();
    passAssertEqual(pendingAfter, 0, '11.c: queue cleared by opt-out flush (no heartbeat enqueued)');
  }

  // -------------------------------------------------------------------------
  // Section 11.d -- Heartbeat does NOT enqueue when queue holds a pending
  // retry event (Quick task 260524-8qv, Codex PR #78 Finding 2, P2).
  //
  // Closes the loophole missed by 11.a/b/c: those tests cover idle+empty,
  // groups>0, and opted-out paths. They do NOT cover the case where the
  // queue is non-empty because a prior POST failed and re-enqueued events
  // with bumped attempts -- and aggregation produced zero NEW groups. With
  // the old `if (agg.groups.length === 0)` guard the heartbeat would land
  // on TOP of the pending retry; at queue cap _applyFifoCap would then drop
  // the OLDEST real event to make room for a redundant heartbeat. The fix
  // tightens the guard to `agg.groups.length === 0 && queue.length === 0`
  // so a pending retry alone suppresses the heartbeat.
  // -------------------------------------------------------------------------
  console.log('\n--- Section 11.d: heartbeat does NOT fire when queue holds a pending retry ---');
  {
    const m = freshRequire();
    const storage = makeShim();
    const fetchShim = makeFetchShim();
    const identity = makeIdentityShim(false);
    wireShims(m, storage, fetchShim, identity);

    // Pre-seed the queue with exactly ONE retry event from a prior failed
    // POST (attempts:1, still under the 5-attempt cap, ts_minute recent so
    // _applyStaleDrop does not eat it). No new MCP rows -> agg.groups.length
    // will be 0. Without the fix, the heartbeat would land on top, producing
    // a 2-event POST: [retry, heartbeat]. With the fix the POST has exactly
    // ONE event (the retry).
    storage._store.fsbUsageData = []; // no new aggregation groups
    storage._store.fsbActiveAgentsCount = 1;
    const now = Date.now();
    storage._store.fsbTelemetryQueue = [{
      event_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      install_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ts_minute: Math.floor((now - 60000) / 60000) * 60000, // 1 min ago, well within 24h
      mcp_client: 'claude-code',
      model: 'claude-opus-4-7',
      tokens_in: 100,
      tokens_out: 50,
      active_agent_count: 1,
      event_type: 'periodic',
      attempts: 1
    }];

    // Default 200 OK fetch -- the retry succeeds so we can inspect the wire body.
    await m.flush();

    passAssertEqual(fetchShim._calls.length, 1, '11.d: exactly one POST issued');
    const body = fetchShim._calls[0].init.body;
    passAssert(body && Array.isArray(body.events), '11.d: POST body has events array');
    passAssertEqual(body.events.length, 1,
      '11.d: POST contains EXACTLY ONE event (the retried claude-code row), NOT 2 (no heartbeat appended)');
    const ev = body.events[0];
    passAssertEqual(ev.mcp_client, 'claude-code',
      '11.d: surviving event is the retried real row, not a heartbeat');
    passAssertEqual(ev.tokens_in, 100, '11.d: retried tokens_in preserved');
    passAssertEqual(ev.tokens_out, 50, '11.d: retried tokens_out preserved');
    const heartbeatLeaked = body.events.some(function (e) {
      return e.mcp_client === 'unknown' && e.tokens_in === 0
        && e.tokens_out === 0 && e.event_type === 'periodic';
    });
    passAssert(!heartbeatLeaked,
      '11.d: no heartbeat event with mcp_client=unknown leaked into the POST when queue already had a retry');
    passAssertEqual((await m.getPendingCount()), 0,
      '11.d: queue empty after retry POST succeeds');

    // Cross-check: re-run flush with an empty queue (just like Section 11.a)
    // and confirm the heartbeat invariant still holds when the queue is
    // genuinely empty. This verifies the tightened guard did not regress
    // the original PRESENCE-01 behaviour.
    storage._store.fsbUsageData = [];
    // fsbTelemetryQueue is empty after the POST above; do not re-seed.
    // Advance the watermark away so the next flush sees an empty aggregation.
    await m.flush();
    passAssertEqual(fetchShim._calls.length, 2,
      '11.d cross-check: second flush issued a POST (heartbeat path still fires when queue empty)');
    const body2 = fetchShim._calls[1].init.body;
    passAssertEqual(body2.events.length, 1,
      '11.d cross-check: second POST contains exactly ONE event (the heartbeat)');
    passAssertEqual(body2.events[0].mcp_client, 'unknown',
      '11.d cross-check: heartbeat is the unknown-client zero-token shape');
  }

  // -------------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------------
  console.log('\n--- Summary ---');
  console.log('Total: ' + passed + ' passed, ' + failed + ' failed');
  if (failed > 0) process.exit(1);
  console.log('All telemetry-collector tests passed.');
  process.exit(0);
})().catch((e) => {
  console.error('FATAL: test harness threw:', e && e.stack ? e.stack : e);
  process.exit(2);
});
