'use strict';

/**
 * Phase 211-03 -- diagnostics ring buffer test.
 * Validates LOG-04 (ring buffer FIFO 100, exportDiagnostics contract, D-09 entry shape).
 *
 * Note: this test runs without chrome.storage.local. The module's in-memory
 * fallback path is exercised. The chrome.storage.local code path is exercised
 * in real-Chrome UAT (no automated test for chrome.* APIs without a SW harness).
 *
 * Run: node tests/diagnostics-ring-buffer.test.js
 */

const assert = require('assert');
const ring = require('../extension/utils/diagnostics-ring-buffer.js');

console.log('--- LOG-04 ring buffer FIFO 100 ---');

assert.strictEqual(ring.MAX_ENTRIES, 100, 'MAX_ENTRIES = 100 (D-09)');
assert.strictEqual(ring.STORAGE_KEY, 'fsb_diagnostics_ring', 'storage key matches D-09');

ring._resetRing();

(async () => {
  for (let i = 0; i < 105; i++) {
    await ring.appendDiagnosticEntry({
      ts: i,
      level: 'warn',
      prefix: 'DOM',
      category: 'test',
      message: 'msg-' + i,
      redactedContext: { idx: i }
    });
  }

  const result1 = await ring.getDiagnosticEntries({});
  assert.strictEqual(result1.entries.length, 100, 'ring trims to last 100 entries (FIFO)');
  assert.strictEqual(result1.entries[0].message, 'msg-5', 'first 5 entries trimmed (FIFO)');
  assert.strictEqual(result1.entries[99].message, 'msg-104', 'last entry preserved');
  console.log('  PASS: FIFO 100 entries with first-5-dropped behavior');

  console.log('--- LOG-04 entry shape (D-09) ---');
  const sample = result1.entries[0];
  assert.strictEqual(typeof sample.ts, 'number', 'ts is number');
  assert.strictEqual(sample.level, 'warn', 'level preserved');
  assert.strictEqual(sample.prefix, 'DOM', 'prefix preserved');
  assert.strictEqual(sample.category, 'test', 'category preserved');
  assert.strictEqual(sample.message, 'msg-5', 'message preserved');
  assert.strictEqual(typeof sample.redactedContext, 'object', 'redactedContext is object');
  console.log('  PASS: entry shape { ts, level, prefix, category, message, redactedContext }');

  console.log('--- LOG-04 defensive copy (whitelisted fields only) ---');
  ring._resetRing();
  await ring.appendDiagnosticEntry({
    ts: 12345,
    level: 'warn',
    prefix: 'DLG',
    category: 'dialog-relay',
    message: 'dialog failed',
    redactedContext: { kind: 'error', message: 'boom' },
    taskText: 'this-is-secret-and-must-not-survive',
    rawPayload: { password: 'leaked' }
  });
  const result2 = await ring.getDiagnosticEntries({});
  assert.strictEqual(result2.entries.length, 1);
  const entry = result2.entries[0];
  assert(!('taskText' in entry), 'taskText not in stored entry (defensive copy)');
  assert(!('rawPayload' in entry), 'rawPayload not in stored entry (defensive copy)');
  assert.strictEqual(entry.redactedContext.kind, 'error', 'redactedContext preserved');
  console.log('  PASS: defensive copy whitelist enforced');

  console.log('--- LOG-04 export with { clear: true } ---');
  const result3 = await ring.getDiagnosticEntries({ clear: true });
  assert.strictEqual(result3.entries.length, 1, 'clear returns existing entries');
  assert.strictEqual(typeof result3.clearedAt, 'number', 'clearedAt timestamp present');
  const result4 = await ring.getDiagnosticEntries({});
  assert.strictEqual(result4.entries.length, 0, 'after clear, ring is empty');
  console.log('  PASS: clear: true empties ring and returns clearedAt');

  console.log('--- CHAN-05 bridge-secret sink sanitization ---');
  const bridgeSecret = 'fsb-auth.' + 'A'.repeat(43);
  const bridgeSecretInterior = 'A'.repeat(16);
  const secretEntry = {
    ts: 54321,
    level: 'warn',
    prefix: 'WS ' + bridgeSecret,
    category: 'Sec-WebSocket-Protocol: ' + bridgeSecret,
    message: 'failed ?token=' + bridgeSecret,
    redactedContext: {
      header: 'Sec-WebSocket-Protocol: fsb-ext-v1, ' + bridgeSecret,
      query: 'token=' + bridgeSecret,
      error: new Error('nested failure ' + bridgeSecret),
      nested: { values: ['safe', bridgeSecret] },
      [bridgeSecret]: 'secret-bearing key'
    }
  };

  const originalChrome = globalThis.chrome;
  const originalSharedScrubber = globalThis.redactBridgeSecretsInString;
  try {
    delete globalThis.chrome;
    delete globalThis.redactBridgeSecretsInString;
    ring._resetRing();
    await ring.appendDiagnosticEntry(secretEntry);
    const memoryOutput = await ring.getDiagnosticEntries({});
    const serializedMemory = JSON.stringify(memoryOutput);
    assert(!serializedMemory.includes(bridgeSecret), 'full bridge token absent from in-memory ring output');
    assert(!serializedMemory.includes(bridgeSecretInterior), 'bridge token interior absent from in-memory ring output');
    assert(serializedMemory.includes('[REDACTED_FSB_BRIDGE_SECRET]'), 'fallback sanitizer emits stable replacement');

    const storage = new Map();
    globalThis.chrome = {
      storage: {
        local: {
          get(keys, callback) {
            const output = {};
            for (const key of keys) {
              if (storage.has(key)) output[key] = storage.get(key);
            }
            callback(output);
          },
          set(update, callback) {
            for (const key of Object.keys(update)) storage.set(key, update[key]);
            callback();
          }
        }
      },
      runtime: { lastError: null }
    };
    ring._resetRing();
    await ring.appendDiagnosticEntry(secretEntry);
    const storedOutput = storage.get(ring.STORAGE_KEY);
    const serializedStorage = JSON.stringify(storedOutput);
    assert(Array.isArray(storedOutput) && storedOutput.length === 1, 'mocked chrome.storage.local receives the entry');
    assert(!serializedStorage.includes(bridgeSecret), 'full bridge token absent from persistent ring output');
    assert(!serializedStorage.includes(bridgeSecretInterior), 'bridge token interior absent from persistent ring output');
    assert(serializedStorage.includes('[REDACTED_FSB_BRIDGE_SECRET]'), 'persistent sink emits stable replacement');

    await ring.appendDiagnosticEntry({
      ts: 54322,
      level: 'debug',
      prefix: 'WS',
      category: 'bounds',
      message: 'bounded context',
      redactedContext: {
        items: Array.from({ length: 105 }, (_, index) => index),
        many: Object.fromEntries(Array.from({ length: 25 }, (_, index) => ['key' + index, index])),
        deep: { a: { b: { c: { credential: bridgeSecret } } } },
        unsupported: function() {}
      }
    });
    const boundedEntry = storage.get(ring.STORAGE_KEY).at(-1);
    assert.strictEqual(boundedEntry.redactedContext.items.length, 100, 'nested arrays are bounded to 100 items');
    assert.strictEqual(Object.keys(boundedEntry.redactedContext.many).length, 20, 'nested objects are bounded to 20 keys');
    assert.strictEqual(boundedEntry.redactedContext.deep.a.b.c.kind, 'object', 'nested objects beyond depth 4 become shape-safe');
    assert.strictEqual(boundedEntry.redactedContext.unsupported.kind, 'function', 'unsupported values become shape-safe');
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
    if (originalSharedScrubber === undefined) delete globalThis.redactBridgeSecretsInString;
    else globalThis.redactBridgeSecretsInString = originalSharedScrubber;
  }
  console.log('  PASS: bridge credentials scrubbed from memory and storage sinks without shared helper loaded');

  console.log('\nAll assertions passed.');
})().catch((err) => { console.error('test failed:', err); process.exit(1); });
