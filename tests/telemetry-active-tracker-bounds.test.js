'use strict';

const assert = require('assert');

process.env.TELEMETRY_ACTIVE_TRACKER_MAX = '4';
process.env.TELEMETRY_IP_DAILY_UUID_MAX = '2';
const activeTracker = require('../showcase/server/src/telemetry/active-tracker');

activeTracker._resetForTest();
const base = Date.UTC(2026, 6, 20, 12);

assert.strictEqual(activeTracker.recordSeen('stale-install', 1, base), true);
assert.strictEqual(activeTracker._sizeForTest(), 1);

// A subsequent write must evict stale state even if no stats read occurred.
const freshNow = base + activeTracker.EVICTION_MS + 1;
assert.strictEqual(activeTracker.recordSeen('install-a', 2, freshNow, 'daily-hash-a'), true);
assert.strictEqual(activeTracker._sizeForTest(), 1, 'recordSeen must lazily evict stale entries');
assert.strictEqual(activeTracker.countActiveUsers(activeTracker.EVICTION_MS, freshNow), 1);

assert.strictEqual(activeTracker.recordSeen('install-b', 3, freshNow, 'daily-hash-a'), true);
assert.strictEqual(activeTracker._sizeForTest(), activeTracker.MAX_ACTIVE_INSTALLS_PER_SOURCE);

// New rotating identities from one daily hashed IP cannot exceed its source cap.
assert.strictEqual(activeTracker.recordSeen('install-c', 4, freshNow, 'daily-hash-a'), false);
assert.strictEqual(activeTracker._sizeForTest(), 2);
assert.strictEqual(activeTracker.getActiveAgentSum(activeTracker.EVICTION_MS, freshNow), 5);

// A separate hashed source has independent headroom, up to the global cap.
assert.strictEqual(activeTracker.recordSeen('install-c', 4, freshNow, 'daily-hash-b'), true);
assert.strictEqual(activeTracker.recordSeen('install-d', 5, freshNow, 'daily-hash-c'), true);
assert.strictEqual(activeTracker._sizeForTest(), activeTracker.MAX_ACTIVE_TRACKER_ENTRIES);
assert.strictEqual(activeTracker.recordSeen('install-e', 6, freshNow, 'daily-hash-d'), false);

// A known install is still allowed to refresh while the map is full.
assert.strictEqual(activeTracker.recordSeen('install-a', 7, freshNow + 1, 'daily-hash-a'), true);
assert.strictEqual(activeTracker._sizeForTest(), 4);
assert.strictEqual(activeTracker.getActiveAgentSum(activeTracker.EVICTION_MS, freshNow + 1), 19);

activeTracker._resetForTest();
assert.strictEqual(activeTracker.recordSeen('legacy-install', 9999, freshNow, 'legacy-source', 0), true);
assert.strictEqual(activeTracker.recordSeen('v2-install', 3, freshNow, 'v2-source', 2), true);
assert.strictEqual(activeTracker.countActiveUsers(activeTracker.EVICTION_MS, freshNow), 2,
  'legacy telemetry still contributes user liveness');
assert.strictEqual(activeTracker.countActiveAgentReporters(activeTracker.EVICTION_MS, freshNow), 1,
  'only v2 installs enter the active-agent denominator');
assert.strictEqual(activeTracker.getActiveAgentSum(activeTracker.EVICTION_MS, freshNow), 3,
  'legacy leaked counts never enter the active-agent numerator');

activeTracker._resetForTest();
delete process.env.TELEMETRY_ACTIVE_TRACKER_MAX;
delete process.env.TELEMETRY_IP_DAILY_UUID_MAX;
console.log('active tracker eviction and hard cap: all assertions passed');
