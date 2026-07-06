'use strict';

/**
 * RAM-based Agent Concurrency recommendation.
 *
 * Run: node tests/agent-cap-recommendation.test.js
 */

const assert = require('assert');
const helper = require('../extension/utils/agent-cap-recommendation.js');

const GiB = helper.BYTES_PER_GIB;

async function withChrome(chromeMock, fn) {
  const prior = globalThis.chrome;
  globalThis.chrome = chromeMock;
  try {
    await fn();
  } finally {
    if (prior === undefined) delete globalThis.chrome;
    else globalThis.chrome = prior;
  }
}

(async () => {
  console.log('--- Test 1: pure RAM formula examples ---');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(64 * GiB), 21, '64 GiB -> 21');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(8 * GiB), 2, '8 GiB -> 2');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(1 * GiB), 1, '1 GiB clamps to 1');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(256 * GiB), 64, '256 GiB caps at 64');
  console.log('  PASS: formula');

  console.log('--- Test 2: invalid capacity falls back to 8 ---');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(undefined), 8, 'undefined -> 8');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(NaN), 8, 'NaN -> 8');
  assert.strictEqual(helper.recommendAgentCapFromCapacityBytes(0), 8, '0 -> 8');
  console.log('  PASS: invalid capacity fallback');

  console.log('--- Test 3: Chrome callback API wrapper ---');
  await withChrome({
    system: {
      memory: {
        getInfo(cb) {
          cb({ capacity: 64 * GiB, availableCapacity: 32 * GiB });
        }
      }
    }
  }, async () => {
    const cap = await helper.getRecommendedAgentCap();
    assert.strictEqual(cap, 21, 'callback getInfo -> 21');
  });
  console.log('  PASS: callback wrapper');

  console.log('--- Test 4: missing Chrome API falls back to 8 ---');
  await withChrome({}, async () => {
    const cap = await helper.getRecommendedAgentCap();
    assert.strictEqual(cap, 8, 'missing chrome.system.memory -> 8');
  });
  console.log('  PASS: missing API fallback');

  console.log('PASS agent-cap-recommendation');
})().catch((err) => {
  console.error('FAIL agent-cap-recommendation:', err && err.stack || err);
  process.exit(1);
});
