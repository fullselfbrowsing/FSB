'use strict';

const assert = require('assert');

process.env.TELEMETRY_UUID_BUDGET_MAX = '2';
delete process.env.TELEMETRY_IP_DAILY_UUID_MAX;
delete process.env.TELEMETRY_IP_DAILY_TOKEN_MAX;
const activeTracker = require('../showcase/server/src/telemetry/active-tracker');
const {
  checkPerUuidBudget,
  forgetPerUuidBudget,
  getPerUuidBudgetSizeForTest,
  PER_IP_DAILY_TOKEN_BUDGET,
  PER_IP_DAILY_UUID_BUDGET,
  resetPerUuidBudget,
} = require('../showcase/server/src/middleware/telemetry-rate-limit');

assert.strictEqual(PER_IP_DAILY_UUID_BUDGET, 20, 'default distinct-install cap must remain bounded');
assert.strictEqual(PER_IP_DAILY_TOKEN_BUDGET, 100_000_000, 'default token contribution cap must remain bounded');
assert.strictEqual(activeTracker.MAX_ACTIVE_INSTALLS_PER_SOURCE, 20);
assert.strictEqual(activeTracker.MAX_ACTIVE_AGENTS_PER_SOURCE, 64);

resetPerUuidBudget();
const dayOne = Date.UTC(2026, 6, 20, 12);
const dayTwo = Date.UTC(2026, 6, 21, 12);

assert.strictEqual(checkPerUuidBudget('install-a', dayOne).ok, true);
assert.strictEqual(checkPerUuidBudget('install-b', dayOne).ok, true);
assert.strictEqual(getPerUuidBudgetSizeForTest(), 2);

assert.strictEqual(forgetPerUuidBudget('install-a'), true, 'privacy deletion must release its UUID budget entry');
assert.strictEqual(getPerUuidBudgetSizeForTest(), 1);
assert.deepStrictEqual(checkPerUuidBudget('install-a', dayOne), { ok: true, currentCount: 1 });
assert.strictEqual(getPerUuidBudgetSizeForTest(), 2);

const overflow = checkPerUuidBudget('install-c', dayOne);
assert.strictEqual(overflow.ok, false);
assert.strictEqual(overflow.reason, 'daily_uuid_capacity');
assert.strictEqual(getPerUuidBudgetSizeForTest(), 2);

assert.strictEqual(checkPerUuidBudget('install-c', dayTwo).ok, true);
assert.strictEqual(getPerUuidBudgetSizeForTest(), 1, 'UTC rollover must discard every stale UUID entry');

resetPerUuidBudget();
delete process.env.TELEMETRY_UUID_BUDGET_MAX;
console.log('telemetry UUID budget memory bounds: all assertions passed');
