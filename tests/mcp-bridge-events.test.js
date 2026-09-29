'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
    return;
  }
  failed++;
  console.error(`  FAIL: ${message}`);
}

function checkEqual(actual, expected, message) {
  const ok = Object.is(actual, expected);
  if (ok) {
    passed++;
    console.log(`  PASS: ${message} (expected: ${expected}, got: ${actual})`);
    return;
  }
  failed++;
  console.error(`  FAIL: ${message} (expected: ${expected}, got: ${actual})`);
}

function withTempRoot(label, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
  try {
    return callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function readLines(root, filename = 'bridge-events.jsonl') {
  const target = path.join(root, filename);
  if (!fs.existsSync(target)) return [];
  return fs.readFileSync(target, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

async function run() {
  const moduleUrl = pathToFileURL(path.join(repoRoot, 'mcp', 'build', 'bridge-events.js')).href;
  const {
    logBridgeEvent,
    _resetBridgeEventCoalescing,
    BRIDGE_LOG_COALESCE_WINDOW_MS,
    BRIDGE_LOG_MAX_BYTES,
  } = await import(moduleUrl);

  console.log('\n--- projection keeps the roster closed and the fields bounded ---');
  withTempRoot('bridge-events-projection', (root) => {
    _resetBridgeEventCoalescing();
    const now = () => 1_000;

    checkEqual(
      logBridgeEvent({ event: 'not_a_real_event', instanceId: 'abcd1234' }, { rootPath: root, now }),
      false,
      'an event outside the roster is refused',
    );
    checkEqual(readLines(root).length, 0, 'a refused event writes no line');

    logBridgeEvent({
      event: 'upgrade_rejected_origin_pin',
      instanceId: 'abcd1234',
      origin: 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh',
      pinnedOrigin: 'chrome-extension://iiiijjjjkkkkllllmmmmnnnnoooopppp',
      // Every field below is malformed and must be dropped rather than echoed.
      reason: 'Not A Code',
      closeCode: 99,
    }, { rootPath: root, now });

    const [record] = readLines(root);
    checkEqual(record.event, 'upgrade_rejected_origin_pin', 'the event name is recorded');
    checkEqual(record.instanceId, 'abcd1234', 'a well-formed instance id is recorded');
    checkEqual(record.pinnedOrigin, 'chrome-extension://iiiijjjjkkkkllllmmmmnnnnoooopppp', 'the pinned origin is recorded');
    checkEqual(record.ts, '1970-01-01T00:00:01.000Z', 'the timestamp comes from the injected clock');
    checkEqual('reason' in record, false, 'a reason that is not a bounded code is dropped');
    checkEqual('closeCode' in record, false, 'a close code outside the WebSocket range is dropped');
  });

  console.log('\n--- hub server errors are journaled with their errno ---');
  withTempRoot('bridge-events-hub-error', (root) => {
    _resetBridgeEventCoalescing();
    checkEqual(
      logBridgeEvent({ event: 'hub_server_error', instanceId: 'abcd1234', reason: 'emfile' }, { rootPath: root, now: () => 1_000 }),
      true,
      'a hub server error is part of the roster',
    );
    const [record] = readLines(root);
    checkEqual(record && record.reason, 'emfile', 'the errno code is kept as the reason');
    checkEqual(
      logBridgeEvent({ event: 'hub_server_error', instanceId: 'abcd1234', reason: 'emfile' }, { rootPath: root, now: () => 2_000 }),
      false,
      'a repeating accept failure is coalesced, which is what gates its stderr line',
    );
  });

  console.log('\n--- credentials and unbounded text never reach the file ---');
  withTempRoot('bridge-events-redaction', (root) => {
    _resetBridgeEventCoalescing();
    logBridgeEvent({
      event: 'extension_closed',
      instanceId: 'not a hex instance id',
      origin: `chrome-extension://abc?secret=fsb-auth.${'A'.repeat(43)}`,
      closeCode: 1008,
      reason: 'extension_auth_revoked',
    }, { rootPath: root, now: () => 2_000 });

    const [record] = readLines(root);
    const serialized = JSON.stringify(record);
    checkEqual(serialized.includes('fsb-auth.'), false, 'a credential smuggled through the origin never reaches the file');
    checkEqual('origin' in record, false, 'an origin that is not an exact extension origin is dropped');
    checkEqual('instanceId' in record, false, 'an instance id that is not lowercase hex is dropped');
    checkEqual(record.closeCode, 1008, 'a close code inside the WebSocket range is kept');
    checkEqual(record.reason, 'extension_auth_revoked', 'a bounded reason code is kept');
  });

  console.log('\n--- coalescing bounds a hot retry loop ---');
  withTempRoot('bridge-events-coalescing', (root) => {
    _resetBridgeEventCoalescing();
    const origin = 'chrome-extension://aaaabbbbccccddddeeeeffffgggghhhh';
    let clock = 10_000;
    const now = () => clock;

    checkEqual(
      logBridgeEvent({ event: 'extension_slot_refused', origin }, { rootPath: root, now }),
      true,
      'the first refusal in a window is written',
    );
    let suppressed = 0;
    for (let i = 0; i < 500; i += 1) {
      clock += 10;
      if (!logBridgeEvent({ event: 'extension_slot_refused', origin }, { rootPath: root, now })) suppressed += 1;
    }
    checkEqual(suppressed, 500, 'every repeat inside the window is coalesced away');
    checkEqual(readLines(root).length, 1, 'a 500-attempt loop leaves exactly one line');

    clock += BRIDGE_LOG_COALESCE_WINDOW_MS;
    checkEqual(
      logBridgeEvent({ event: 'extension_slot_refused', origin }, { rootPath: root, now }),
      true,
      'the first refusal after the window reopens is written',
    );
    const lines = readLines(root);
    checkEqual(lines.length, 2, 'reopening the window writes a second line');
    checkEqual(lines[1].suppressed, 500, 'the reopened line reports how many attempts it stood for');

    // A different origin is a different story and must not be coalesced into
    // the first one.
    checkEqual(
      logBridgeEvent({
        event: 'extension_slot_refused',
        origin: 'chrome-extension://iiiijjjjkkkkllllmmmmnnnnoooopppp',
      }, { rootPath: root, now }),
      true,
      'a different origin is coalesced separately',
    );
  });

  console.log('\n--- rotation keeps the journal bounded ---');
  withTempRoot('bridge-events-rotation', (root) => {
    _resetBridgeEventCoalescing();
    const logPath = path.join(root, 'bridge-events.jsonl');
    fs.writeFileSync(logPath, 'x'.repeat(BRIDGE_LOG_MAX_BYTES + 1), 'utf8');

    let clock = 30_000;
    logBridgeEvent({ event: 'extension_reaped', reason: 'pong_timeout' }, {
      rootPath: root,
      now: () => (clock += BRIDGE_LOG_COALESCE_WINDOW_MS),
    });

    check(fs.existsSync(path.join(root, 'bridge-events.1.jsonl')), 'an oversized journal is rotated aside');
    checkEqual(readLines(root).length, 1, 'the fresh journal holds only the new line');
  });

  console.log('\n--- a broken destination never propagates ---');
  withTempRoot('bridge-events-failclosed', (root) => {
    _resetBridgeEventCoalescing();
    checkEqual(
      logBridgeEvent({ event: 'extension_closed' }, { rootPath: 'relative/path', now: () => 40_000 }),
      false,
      'a non-absolute root is refused rather than resolved',
    );
    // The directory is replaced by a file, so every filesystem call below throws.
    const blocked = path.join(root, 'blocked');
    fs.writeFileSync(blocked, 'not a directory', 'utf8');
    checkEqual(
      logBridgeEvent({ event: 'extension_closed' }, { rootPath: blocked, now: () => 50_000 }),
      false,
      'an unusable destination reports failure instead of throwing',
    );
  });

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((error) => {
  failed++;
  console.error('  FAIL: Test harness failed:', error);
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(1);
});
