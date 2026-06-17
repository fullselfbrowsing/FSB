'use strict';

/**
 * Phase 276 STREAM-DEFENSIVE-06 -- WS backpressure drop counter.
 *
 * Asserts:
 *  1. handler.js exports BACKPRESSURE_BUFFER_LIMIT_BYTES = 16 MiB and the
 *     accessor/reset helpers.
 *  2. sendToClients drops the frame and increments the counter when a
 *     client's bufferedAmount exceeds the limit (no client.send invocation).
 *  3. sendToClients delivers normally when bufferedAmount is below the limit.
 *  4. sendToClients drops on readyState != OPEN (existing behaviour) and
 *     does NOT double-count via the backpressure counter for that path.
 *  5. backpressureDroppedCount accumulates across calls.
 *  6. A backpressure-drop event is pushed into the room diagnostics ring
 *     for the dropped frame (audit trail).
 *
 * Run: node tests/server-ws-backpressure.test.js
 */

const path = require('path');
const assert = require('assert');

const handler = require(path.join(__dirname, '..', 'showcase', 'server', 'src', 'ws', 'handler.js'));

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed += 1; console.log(`  PASS: ${label}`); }
  else { failed += 1; console.log(`  FAIL: ${label} -- ${detail || ''}`); }
}

console.log('--- handler.js backpressure exports ---');

check(
  'BACKPRESSURE_BUFFER_LIMIT_BYTES exported = 16 * 1024 * 1024',
  handler.BACKPRESSURE_BUFFER_LIMIT_BYTES === 16 * 1024 * 1024,
  'limit constant wrong: ' + handler.BACKPRESSURE_BUFFER_LIMIT_BYTES
);
check(
  'RELAY_PER_MESSAGE_LIMIT_BYTES exported = 1 * 1024 * 1024',
  handler.RELAY_PER_MESSAGE_LIMIT_BYTES === 1024 * 1024,
  'relay cap wrong: ' + handler.RELAY_PER_MESSAGE_LIMIT_BYTES
);
check(
  'checkRelayFrameLimit exported',
  typeof handler.checkRelayFrameLimit === 'function',
  'checkRelayFrameLimit missing'
);
check(
  'classifyRelayFrame exported',
  typeof handler.classifyRelayFrame === 'function',
  'classifyRelayFrame missing'
);
check(
  'getBackpressureDroppedCount exported',
  typeof handler.getBackpressureDroppedCount === 'function',
  'accessor missing'
);
check(
  'sendToClients exported (for test)',
  typeof handler.sendToClients === 'function',
  'sendToClients missing from exports'
);
check(
  '_resetBackpressureDroppedCount exported',
  typeof handler._resetBackpressureDroppedCount === 'function',
  'reset helper missing'
);

// Reset the counter before our scenarios
handler._resetBackpressureDroppedCount();
check(
  'counter resets to 0 via _resetBackpressureDroppedCount',
  handler.getBackpressureDroppedCount() === 0,
  'expected 0; got ' + handler.getBackpressureDroppedCount()
);

console.log('\n--- backpressure-drop scenarios ---');

// WebSocket.OPEN is 1 per the ws module spec; we mirror that constant locally.
const WS_OPEN = 1;
const WS_CLOSING = 2;

function makeStubClient(bufferedAmount, readyState) {
  let sendCalls = 0;
  return {
    readyState: typeof readyState === 'number' ? readyState : WS_OPEN,
    bufferedAmount: bufferedAmount,
    send: function () { sendCalls += 1; },
    _sendCalls: function () { return sendCalls; }
  };
}

// Scenario 1: client buffered above the 16MiB limit -- drop + counter++.
{
  handler._resetBackpressureDroppedCount();
  const wedged = makeStubClient(handler.BACKPRESSURE_BUFFER_LIMIT_BYTES + 1, WS_OPEN);
  const fast = makeStubClient(0, WS_OPEN);
  const result = handler.sendToClients(
    'test-room-A',
    new Set([wedged, fast]),
    JSON.stringify({ type: 'ext:dom-mutations', payload: { mutations: [] } }),
    'ext:dom-mutations',
    'extension->dashboard'
  );
  check(
    'sim 1: targetCount=2 (both clients counted)',
    result.targetCount === 2,
    'targetCount=' + result.targetCount
  );
  check(
    'sim 1: deliveredCount=1 (fast client only)',
    result.deliveredCount === 1,
    'deliveredCount=' + result.deliveredCount
  );
  check(
    'sim 1: droppedCount=1 (wedged client)',
    result.droppedCount === 1,
    'droppedCount=' + result.droppedCount
  );
  check(
    'sim 1: wedged client.send NOT called',
    wedged._sendCalls() === 0,
    'wedged.send called ' + wedged._sendCalls() + ' times (expected 0)'
  );
  check(
    'sim 1: fast client.send called once',
    fast._sendCalls() === 1,
    'fast.send called ' + fast._sendCalls() + ' times (expected 1)'
  );
  check(
    'sim 1: backpressureDroppedCount === 1',
    handler.getBackpressureDroppedCount() === 1,
    'counter=' + handler.getBackpressureDroppedCount()
  );
}

// Scenario 2: both clients below the limit -- normal delivery.
{
  handler._resetBackpressureDroppedCount();
  const a = makeStubClient(1024, WS_OPEN);
  const b = makeStubClient(500000, WS_OPEN);
  const result = handler.sendToClients(
    'test-room-B',
    new Set([a, b]),
    'frame',
    'ext:dom-mutations',
    'extension->dashboard'
  );
  check(
    'sim 2: deliveredCount=2 (both clients)',
    result.deliveredCount === 2,
    'deliveredCount=' + result.deliveredCount
  );
  check(
    'sim 2: droppedCount=0',
    result.droppedCount === 0,
    'droppedCount=' + result.droppedCount
  );
  check(
    'sim 2: backpressureDroppedCount === 0 (no drops)',
    handler.getBackpressureDroppedCount() === 0,
    'counter=' + handler.getBackpressureDroppedCount()
  );
}

// Scenario 3: client in CLOSING state -- pre-existing drop path; backpressure
// counter should NOT increment for that path.
{
  handler._resetBackpressureDroppedCount();
  const closing = makeStubClient(0, WS_CLOSING);
  const result = handler.sendToClients(
    'test-room-C',
    new Set([closing]),
    'frame',
    'ext:dom-mutations',
    'extension->dashboard'
  );
  check(
    'sim 3: droppedCount=1 (readyState != OPEN)',
    result.droppedCount === 1,
    'droppedCount=' + result.droppedCount
  );
  check(
    'sim 3: backpressureDroppedCount === 0 (not a backpressure drop)',
    handler.getBackpressureDroppedCount() === 0,
    'counter=' + handler.getBackpressureDroppedCount() + ' (expected 0)'
  );
}

// Scenario 4: counter accumulates across multiple sendToClients calls.
{
  handler._resetBackpressureDroppedCount();
  for (let i = 0; i < 5; i++) {
    const wedged = makeStubClient(handler.BACKPRESSURE_BUFFER_LIMIT_BYTES * 2, WS_OPEN);
    handler.sendToClients(
      'test-room-D-' + i,
      new Set([wedged]),
      'frame',
      'ext:dom-mutations',
      'extension->dashboard'
    );
  }
  check(
    'sim 4: counter accumulates 5 drops across calls',
    handler.getBackpressureDroppedCount() === 5,
    'counter=' + handler.getBackpressureDroppedCount()
  );
}

// Scenario 5: backpressure-drop event recorded in the room diagnostics ring.
{
  handler._resetBackpressureDroppedCount();
  const wedged = makeStubClient(handler.BACKPRESSURE_BUFFER_LIMIT_BYTES + 1, WS_OPEN);
  handler.sendToClients(
    'test-room-E',
    new Set([wedged]),
    'frame',
    'ext:dom-mutations',
    'extension->dashboard'
  );
  const diagnostics = handler.getRoomDiagnostics('test-room-E');
  check(
    'sim 5: getRoomDiagnostics returns events for test-room-E',
    diagnostics && Array.isArray(diagnostics.events),
    'diagnostics not present'
  );
  const events = (diagnostics && diagnostics.events) || [];
  const bpDrop = events.find(e => e.event === 'backpressure-drop');
  check(
    'sim 5: backpressure-drop event recorded',
    !!bpDrop,
    'no backpressure-drop event in ring'
  );
  if (bpDrop) {
    check(
      'sim 5: event has type=ext:dom-mutations',
      bpDrop.type === 'ext:dom-mutations',
      'type=' + bpDrop.type
    );
    check(
      'sim 5: event has bufferedAmount > limit',
      typeof bpDrop.bufferedAmount === 'number' && bpDrop.bufferedAmount > handler.BACKPRESSURE_BUFFER_LIMIT_BYTES,
      'bufferedAmount=' + bpDrop.bufferedAmount
    );
    check(
      'sim 5: event has limitBytes = BACKPRESSURE_BUFFER_LIMIT_BYTES',
      bpDrop.limitBytes === handler.BACKPRESSURE_BUFFER_LIMIT_BYTES,
      'limitBytes=' + bpDrop.limitBytes
    );
  }
}

console.log(`\n=== server-ws-backpressure results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
process.exit(0);
