'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const transport = require('../extension/utils/mcp-session-export-port.js');

function eventChannel() {
  const listeners = [];
  return {
    addListener(listener) { listeners.push(listener); },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index !== -1) listeners.splice(index, 1);
    },
    emit(value) { listeners.slice().forEach((listener) => listener(value)); }
  };
}

function pairedPorts() {
  const leftMessage = eventChannel();
  const rightMessage = eventChannel();
  const leftDisconnect = eventChannel();
  const rightDisconnect = eventChannel();
  let disconnected = false;
  function endpoint(incoming, outgoing, ownDisconnect, peerDisconnect) {
    return {
      onMessage: incoming,
      onDisconnect: ownDisconnect,
      postMessage(message) {
        if (disconnected) throw new Error('port disconnected');
        queueMicrotask(() => {
          if (!disconnected) outgoing.emit(structuredClone(message));
        });
      },
      disconnect() {
        if (disconnected) return;
        disconnected = true;
        ownDisconnect.emit();
        peerDisconnect.emit();
      }
    };
  }
  return {
    client: endpoint(leftMessage, rightMessage, leftDisconnect, rightDisconnect),
    producer: endpoint(rightMessage, leftMessage, rightDisconnect, leftDisconnect)
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flush() {
  for (let index = 0; index < 12; index++) await Promise.resolve();
}

test('export transport keeps exactly one chunk outstanding until its file write is acknowledged', async () => {
  const ports = pairedPorts();
  const firstWrite = deferred();
  const generated = [];
  const written = [];
  const producer = transport.serveExportPort(ports.producer, async ({ sessionId, format, emit }) => {
    assert.equal(sessionId, 'session-stream');
    assert.equal(format, 'json');
    generated.push('first');
    await emit('{"first":');
    generated.push('second');
    await emit('true}');
    return true;
  }, { ackTimeoutMs: 1_000 });

  const streamed = transport.streamExportToWritable({
    connect: () => ports.client,
    sessionId: 'session-stream',
    format: 'json',
    writable: {
      async write(value) {
        written.push(value);
        if (written.length === 1) await firstWrite.promise;
      }
    }
  });

  await flush();
  assert.deepEqual(generated, ['first']);
  assert.deepEqual(written, ['{"first":']);
  assert.equal(producer.getState().pending, true);
  firstWrite.resolve();
  const result = await streamed;
  assert.deepEqual(generated, ['first', 'second']);
  assert.equal(written.join(''), '{"first":true}');
  assert.equal(result.chunks, 2);
});

test('writer failures cancel the producer and preserve the write error', async () => {
  const ports = pairedPorts();
  const producer = transport.serveExportPort(ports.producer, async ({ emit }) => {
    await emit('first');
    await emit('second');
    return true;
  });
  await assert.rejects(
    transport.streamExportToWritable({
      connect: () => ports.client,
      sessionId: 'session-write-failure',
      format: 'text',
      writable: { async write() { throw new Error('disk full'); } }
    }),
    /disk full/
  );
  await flush();
  assert.equal(producer.getState().cancelled || producer.getState().disconnected, true);
});

test('missing acknowledgements and disconnects terminate the producer', async () => {
  const timeoutPorts = pairedPorts();
  const timeoutProducer = transport.serveExportPort(timeoutPorts.producer, async ({ emit }) => {
    await emit('blocked');
    return true;
  }, { ackTimeoutMs: 5 });
  const neverWritten = deferred();
  await assert.rejects(
    transport.streamExportToWritable({
      connect: () => timeoutPorts.client,
      sessionId: 'session-timeout',
      format: 'json',
      writable: { write() { return neverWritten.promise; } }
    }),
    (error) => error.code === 'session_export_ack_timeout'
  );
  assert.equal(timeoutProducer.getState().pending, false);

  const disconnectPorts = pairedPorts();
  const disconnectProducer = transport.serveExportPort(disconnectPorts.producer, async ({ emit }) => {
    await emit('blocked');
    return true;
  });
  disconnectPorts.client.postMessage({ type: 'start', sessionId: 'session-disconnect', format: 'json' });
  await flush();
  disconnectPorts.client.disconnect();
  await flush();
  assert.equal(disconnectProducer.getState().disconnected, true);
  assert.equal(disconnectProducer.getState().pending, false);
});
