import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { mkdtemp, chmod, rm, mkdir, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RecordingProxy, resultData } from './mcp-record-proxy.mjs';
import { operationClock } from './browser-scheduler.mjs';

const rejection = (code, error, execution_outcome = 'not_executed') => ({ isError: true,
  content: [{ type: 'text', text: JSON.stringify({ success: false, code, error, execution_outcome }) }] });

// The controller retains ownership and the running slot until bounded native
// work settles, even when a downstream request is cancelled or disconnected.
export async function startTaskGateway(options) {
  const work = await mkdtemp(path.join(tmpdir(), 'om2w-rpc-'));
  const socketPath = path.join(work, 'rpc.sock');
  const ProxyClass = options.ProxyClass ?? RecordingProxy;
  const proxy = new ProxyClass(options);
  const now = options.gatewayNow ?? Date.now, clock = options.gatewayClock ?? operationClock;
  const setTimer = options.gatewaySetTimeout ?? setTimeout, clearTimer = options.gatewayClearTimeout ?? clearTimeout;
  const maxQueueMs = Math.max(0, Math.min(60_000, options.gatewayQueueTimeoutMs ?? 60_000));
  const maxOperationMs = Math.max(1, Math.min(295_000, options.gatewayOperationTimeoutMs ?? 295_000));
  const sockets = new Set(), entries = new Set(), requests = new Map(), background = new Set();
  let queue = Promise.resolve(), journal = Promise.resolve(), initialized, closing = false, closed, journalError;
  const rawReady = mkdir(options.rawDir, { recursive: true });
  const elapsed = (start, end) => Math.max(0, end.monotonic_ms - start.monotonic_ms);
  const track = promise => {
    const held = promise.catch(error => {
      journalError ??= error;
      proxy.scheduler?.halt('Task gateway evidence could not be persisted: ' + error.message);
      proxy.onFault?.({ code: 'GATEWAY_EVIDENCE_FAILED', error: error.message });
    });
    background.add(held); held.finally(() => background.delete(held)); return held;
  };
  const log = (entry, event, fields = {}) => {
    const context = entry.context;
    const row = { event, at: clock(), request_id: entry.message.id, gateway_request_id: context.gateway_request_id,
      method: entry.message.method, tool: entry.message.params?.name ?? null,
      received: context.received, dispatched: context.dispatched ?? null, finished: context.finished ?? null,
      queue_wait_ms: context.queue_wait_ms ?? null, queue_deadline_epoch_ms: context.queue_deadline_epoch_ms,
      operation_deadline_epoch_ms: context.operation_deadline_epoch_ms,
      operation_ids: [...(context.operation_ids ?? [])], ...fields };
    const written = journal.then(async () => { await rawReady; await appendFile(path.join(options.rawDir, 'gateway-requests.jsonl'), JSON.stringify(row) + '\n'); });
    journal = written.catch(() => {}); return written;
  };
  const forget = entry => {
    clearTimer(entry.queueTimer); clearTimer(entry.operationTimer);
    entries.delete(entry); requests.get(entry.socket)?.delete(entry.message.id);
  };
  const send = (entry, result, rpcError) => {
    if (entry.responded || entry.socket.destroyed || !entry.socket.writable) return false;
    entry.responded = true;
    entry.socket.write(JSON.stringify({ jsonrpc: '2.0', id: entry.message.id,
      ...(rpcError ? { error: rpcError } : { result }) }) + '\n');
    return true;
  };
  const respondRejected = (entry, code, message, outcome = 'not_executed', result) => entry.message.method === 'tools/call'
    ? send(entry, result ?? rejection(code, message, outcome))
    : send(entry, null, { code: -32800, message, data: { code, execution_outcome: outcome } });
  function rejectQueued(entry, code, message) {
    if (entry.state !== 'queued') return entry.rejected ?? Promise.resolve();
    entry.state = 'rejected'; clearTimer(entry.queueTimer);
    entry.context.rejected = clock(); entry.context.queue_wait_ms = elapsed(entry.context.received, entry.context.rejected);
    entry.context.cancel_code = code; entry.abort.abort();
    entry.rejected = (async () => {
      try {
        await entry.accounting;
        const result = await proxy.rejectGatewayRequest?.(entry.message.method, entry.message.params, entry.context, code, message);
        await log(entry, 'rejected', { rejected: entry.context.rejected, code, error: message,
          args: entry.message.params?.arguments ?? {}, execution_outcome: 'not_executed',
          budget_charged: entry.context.accounting?.charged ?? null });
        respondRejected(entry, code, message, 'not_executed', result);
      } finally { forget(entry); }
    })();
    track(entry.rejected); return entry.rejected;
  }
  function cancel(entry, code, message) {
    if (entry.state === 'queued') return rejectQueued(entry, code, message);
    if (entry.state !== 'running' || entry.context.signal.aborted) return;
    entry.context.cancel_code = code; entry.context.cancel_requested = clock(); entry.abort.abort();
    proxy.cancelGatewayRequest?.(entry.context);
    const outcome = entry.context.native_dispatches || !proxy.accountGatewayRequest ? 'unknown' : 'not_executed';
    track(log(entry, 'cancel_requested', { cancel_requested: entry.context.cancel_requested,
      code, error: message, execution_outcome: outcome, native_dispatches: entry.context.native_dispatches ?? null,
      running_slot_retained: true }));
    respondRejected(entry, code, message, outcome);
  }
  async function dispatch(entry) {
    try {
      const denied = await entry.accounting; await entry.receivedRecord;
      if (entry.state !== 'queued') { await entry.rejected; return; }
      if (denied) { await rejectQueued(entry, denied.code, denied.message); return; }
      if (now() >= entry.context.queue_deadline_epoch_ms) {
        const operationExpired = now() >= entry.context.operation_deadline_epoch_ms;
        await rejectQueued(entry, operationExpired ? 'OPERATION_DEADLINE' : 'GATEWAY_QUEUE_TIMEOUT', 'Request expired in the task gateway queue before dispatch'); return;
      }
      clearTimer(entry.queueTimer); entry.state = 'running'; entry.context.dispatched = clock();
      entry.context.queue_wait_ms = elapsed(entry.context.received, entry.context.dispatched);
      entry.operationTimer = setTimer(() => cancel(entry, 'OPERATION_DEADLINE', 'Request receive-time deadline reached; running work retains its slot until settled'),
        Math.max(0, entry.context.operation_deadline_epoch_ms - now()));
      track(log(entry, 'dispatched'));
      let result;
      if (entry.message.method === 'initialize') {
        initialized ??= proxy.handle(entry.message.method, entry.message.params, entry.context);
        result = await initialized;
      } else result = await proxy.handle(entry.message.method, entry.message.params, entry.context);
      entry.context.finished = clock();
      const observations = resultData(result).filter(row => row.observation).map(row => ({
        operation_id: row.observation.operation_id, frame_id: row.observation.frame_id, tab_id: row.observation.tab_id }));
      await log(entry, 'finished', { observations, cancelled: entry.context.signal.aborted,
        native_dispatches: entry.context.native_dispatches ?? null, first_native_dispatch: entry.context.first_native_dispatch ?? null });
      if (!entry.context.signal.aborted && now() >= entry.context.operation_deadline_epoch_ms)
        cancel(entry, 'OPERATION_DEADLINE', 'Request receive-time deadline reached before response emission');
      if (!entry.context.signal.aborted && send(entry, result)) {
        const emitted = clock();
        try { await proxy.noteEmitted?.(result, entry.context); }
        catch (error) {
          journalError ??= error;
          proxy.scheduler?.halt('Task response emission evidence could not be verified: ' + error.message);
          proxy.onFault?.({ code: 'GATEWAY_EVIDENCE_FAILED', error: error.message });
          throw error;
        }
        await log(entry, 'emitted', { emitted, observations,
          roundtrip_ms: elapsed(entry.context.received, emitted), delivery: 'MCP response accepted by task socket writer; model processing is unobserved' });
      }
    } catch (error) {
      entry.context.finished ??= clock();
      if (!entry.responded) send(entry, null, error.rpcError ?? { code: -32603, message: error.message });
      await log(entry, 'failed', { code: error.code ?? 'GATEWAY_ERROR', error: error.message,
        execution_outcome: entry.context.native_dispatches ? 'unknown' : 'not_executed' });
    } finally { if (entry.state !== 'rejected') { entry.state = 'finished'; forget(entry); } }
  }
  const server = createServer(socket => {
    if (closing) { socket.destroy(); return; }
    sockets.add(socket); requests.set(socket, new Map());
    socket.on('error', () => {});
    socket.once('close', () => {
      sockets.delete(socket);
      for (const entry of requests.get(socket)?.values() ?? []) cancel(entry, 'GATEWAY_CLIENT_DISCONNECTED', 'Caller disconnected before this request settled');
      requests.delete(socket);
    });
    const lines = createInterface({ input: socket });
    lines.on('line', line => {
      let message;
      try { message = JSON.parse(line); } catch { socket.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON' } }) + '\n'); return; }
      if (message?.id === undefined) {
        if (message?.method === 'notifications/cancelled') {
          const entry = requests.get(socket)?.get(message.params?.requestId);
          if (entry) cancel(entry, 'GATEWAY_CANCELLED', 'Caller cancelled this request');
        } else if (message?.method === 'notifications/initialized') proxy.upstream.notify(message.method, message.params);
        return;
      }
      if (requests.get(socket).has(message.id)) {
        socket.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32600, message: 'Request ID is already pending on this connection' } }) + '\n'); return;
      }
      const receivedMs = now(), abort = new AbortController();
      const entry = { socket, message, abort, state: 'queued', context: { request_id: message.id,
        gateway_request_id: randomUUID(), received: clock(), queue_deadline_epoch_ms: receivedMs + Math.min(maxQueueMs, maxOperationMs),
        operation_deadline_epoch_ms: receivedMs + maxOperationMs, signal: abort.signal, now } };
      entries.add(entry); requests.get(socket).set(message.id, entry);
      entry.receivedRecord = log(entry, 'received'); track(entry.receivedRecord);
      entry.accounting = Promise.resolve().then(() => proxy.accountGatewayRequest?.(message.method, message.params, entry.context));
      track(entry.accounting.then(denied => { if (denied) return rejectQueued(entry, denied.code, denied.message); }));
      entry.queueTimer = setTimer(() => {
        const operationExpired = now() >= entry.context.operation_deadline_epoch_ms;
        rejectQueued(entry, operationExpired ? 'OPERATION_DEADLINE' : 'GATEWAY_QUEUE_TIMEOUT', 'Request expired in the task gateway queue before dispatch');
      }, Math.max(0, entry.context.queue_deadline_epoch_ms - now()));
      queue = queue.catch(error => { journalError ??= error; }).then(() => dispatch(entry)); track(queue);
    });
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(socketPath, resolve); });
    await chmod(socketPath, 0o600);
    proxy.upstream.onNotification = message => {
      if (message.method === 'notifications/progress') for (const socket of sockets) if (!socket.destroyed) socket.write(JSON.stringify(message) + '\n');
    };
  } catch (error) { await proxy.close(); await rm(work, { recursive: true, force: true }); throw error; }
  return {
    proxy, socketPath,
    async initialize() {
      initialized ??= proxy.handle('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'om2w-task-controller', version: '2' } });
      const result = await initialized; proxy.upstream.notify('notifications/initialized'); return result;
    },
    cancelPending() {
      for (const entry of entries) cancel(entry, 'GATEWAY_CANCELLED', 'Task controller cancelled pending actor requests');
      proxy.scheduler?.cancelOwner(proxy.ownerId);
    },
    close() {
      return closed ??= (async () => {
        closing = true;
        for (const entry of entries) cancel(entry, 'GATEWAY_CANCELLED', 'Task gateway is closing; no queued request will be dispatched');
        for (const socket of sockets) socket.destroy();
        try {
          try {
            await queue;
            while (background.size) await Promise.all([...background]);
            await journal;
          } finally { await proxy.close({ closeTab: true }); }
          if (journalError) throw journalError;
        } finally {
          await new Promise(resolve => server.close(resolve)); await rm(work, { recursive: true, force: true });
        }
      })();
    },
  };
}
