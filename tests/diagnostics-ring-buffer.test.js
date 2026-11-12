'use strict';

/**
 * Phase 211-03 -- diagnostics ring buffer test.
 * Validates LOG-04 (ring buffer FIFO 100, exportDiagnostics contract, D-09 entry shape).
 *
 * The client has no storage authority. This test covers its in-memory fallback,
 * fixed runtime messages, and the background-owned trusted-store fast path.
 *
 * Run: node tests/diagnostics-ring-buffer.test.js
 */

const assert = require('assert');
const ring = require('../extension/utils/diagnostics-ring-buffer.js');
const trustedStoreApi = require('../extension/utils/trusted-local-feature-store.js');

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

  console.log('--- LOG-04 storage-free fixed-message client ---');
  const bridgeSecret = 'fsb-auth.' + 'A'.repeat(43);
  const bridgeSecretInterior = 'A'.repeat(16);
  const secretEntry = {
    ts: 54321,
    level: 'warn',
    prefix: 'WS ' + bridgeSecret,
    category: 'Sec-WebSocket-Protocol: ' + bridgeSecret,
    message: 'failed ?token=' + bridgeSecret,
    redactedContext: {
      origin: 'https://example.test/private?token=' + bridgeSecret,
      statusCode: '503',
      kind: 'bridge-' + bridgeSecret,
      lengths: {
        request: 12,
        response: '34',
        invalid: 'not-a-number',
        ['bad key']: 99
      },
      header: 'Sec-WebSocket-Protocol: fsb-ext-v1, ' + bridgeSecret,
      query: 'token=' + bridgeSecret,
      nested: { values: ['safe', bridgeSecret] }
    }
  };

  const originalChrome = globalThis.chrome;
  const originalTrustedStore = globalThis.fsbTrustedLocalFeatureStore;
  const originalSharedScrubber = globalThis.redactBridgeSecretsInString;
  try {
    delete globalThis.chrome;
    delete globalThis.fsbTrustedLocalFeatureStore;
    delete globalThis.redactBridgeSecretsInString;
    ring._resetRing();
    await ring.appendDiagnosticEntry(secretEntry);
    const memoryOutput = await ring.getDiagnosticEntries({});
    const serializedMemory = JSON.stringify(memoryOutput);
    assert(!serializedMemory.includes(bridgeSecret), 'full bridge token absent from in-memory ring output');
    assert(!serializedMemory.includes(bridgeSecretInterior), 'bridge token interior absent from in-memory ring output');
    assert(serializedMemory.includes('[REDACTED_FSB_BRIDGE_SECRET]'), 'fallback sanitizer emits stable replacement');

    const fixedMessages = [];
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(message, callback) {
          fixedMessages.push(structuredClone(message));
          if (message.action === 'fsb:diagnostic-get') {
            callback({
              ok: true,
              entries: [fixedMessages[0].entry],
              ...(message.clear ? { clearedAt: 24680 } : {})
            });
          } else {
            callback({ ok: true });
          }
        }
      }
    };
    ring._resetRing();
    await ring.appendDiagnosticEntry(secretEntry);
    assert.strictEqual(fixedMessages.length, 1, 'append uses one fixed runtime message');
    assert.deepStrictEqual(Object.keys(fixedMessages[0]).sort(), ['action', 'entry'],
      'append message exposes no generic storage key or operation');
    assert.strictEqual(fixedMessages[0].action, 'fsb:diagnostic-append');
    assert.deepStrictEqual(Object.keys(fixedMessages[0].entry.redactedContext).sort(),
      ['kind', 'lengths', 'origin', 'statusCode'], 'redactedContext uses the narrow context whitelist');
    assert.deepStrictEqual(fixedMessages[0].entry.redactedContext.lengths,
      { request: 12, response: 34 }, 'lengths retains only valid numeric counters');
    assert(!JSON.stringify(fixedMessages[0]).includes(bridgeSecret),
      'fixed append message scrubs the bridge credential');
    assert(JSON.stringify(fixedMessages[0]).includes('[REDACTED_FSB_BRIDGE_SECRET]'),
      'fixed append message uses the stable bridge-secret replacement');

    const remote = await ring.getDiagnosticEntries({ clear: true });
    assert.strictEqual(fixedMessages.length, 2, 'get uses one fixed runtime message');
    assert.deepStrictEqual(fixedMessages[1], { action: 'fsb:diagnostic-get', clear: true },
      'get message has the exact fixed schema');
    assert.strictEqual(remote.entries.length, 1, 'fixed response returns trusted entries');
    assert.strictEqual(remote.clearedAt, 24680, 'fixed clear response preserves trusted clearedAt');

    console.log('  PASS: fixed messages are exact, context-minimized, and bridge-secret scrubbed');

    console.log('--- LOG-04 background trusted-store persistence ---');
    const durable = {};
    const local = {
      async get(keys) {
        const selected = {};
        for (const key of (Array.isArray(keys) ? keys : [keys])) {
          if (Object.hasOwn(durable, key)) selected[key] = structuredClone(durable[key]);
        }
        return selected;
      },
      async set(update) {
        for (const [key, value] of Object.entries(update)) durable[key] = structuredClone(value);
      },
      async remove(keys) {
        for (const key of (Array.isArray(keys) ? keys : [keys])) delete durable[key];
      }
    };
    const trustedChrome = {
      runtime: { id: 'diagnostics-test-extension' },
      storage: { local }
    };
    globalThis.fsbTrustedLocalFeatureStore = trustedStoreApi.create({
      chrome: trustedChrome,
      now: () => 13579
    });
    let unexpectedMessages = 0;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        sendMessage(_message, callback) {
          unexpectedMessages += 1;
          callback({ ok: false });
        }
      }
    };
    ring._resetRing();
    await ring.appendDiagnosticEntry(secretEntry);
    const storedOutput = durable[ring.STORAGE_KEY];
    const serializedStorage = JSON.stringify(storedOutput);
    assert(Array.isArray(storedOutput) && storedOutput.length === 1,
      'background-owned trusted store receives the durable entry');
    assert.strictEqual(unexpectedMessages, 0, 'trusted-store fast path bypasses runtime messaging');
    assert.deepStrictEqual(Object.keys(storedOutput[0].redactedContext).sort(),
      ['kind', 'lengths', 'origin', 'statusCode'], 'trusted store re-enforces the narrow context schema');
    assert.strictEqual(storedOutput[0].redactedContext.origin, 'https://example.test',
      'trusted store reduces URLs to their origin');
    assert(!serializedStorage.includes(bridgeSecret), 'full bridge token absent from durable ring output');
    assert(!serializedStorage.includes(bridgeSecretInterior), 'bridge token interior absent from durable ring output');
    assert(serializedStorage.includes('[REDACTED_FSB_BRIDGE_SECRET]'),
      'durable sink uses the stable bridge-secret replacement');

    const trustedClear = await ring.getDiagnosticEntries({ clear: true });
    assert.strictEqual(trustedClear.entries.length, 1, 'trusted clear returns the durable entry');
    assert.strictEqual(trustedClear.clearedAt, 13579, 'trusted clear timestamp comes from the store');
    assert.deepStrictEqual(durable[ring.STORAGE_KEY], [], 'trusted clear empties durable storage');
  } finally {
    if (originalChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = originalChrome;
    if (originalTrustedStore === undefined) delete globalThis.fsbTrustedLocalFeatureStore;
    else globalThis.fsbTrustedLocalFeatureStore = originalTrustedStore;
    if (originalSharedScrubber === undefined) delete globalThis.redactBridgeSecretsInString;
    else globalThis.redactBridgeSecretsInString = originalSharedScrubber;
  }
  console.log('  PASS: trusted storage is durable, context-minimized, and bridge-secret scrubbed');

  console.log('\nAll assertions passed.');
})().catch((err) => { console.error('test failed:', err); process.exit(1); });
