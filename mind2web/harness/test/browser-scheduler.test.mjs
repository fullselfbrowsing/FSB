import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserScheduler } from '../browser-scheduler.mjs';

test('a drain capture cannot acquire the lease after its hard operation deadline', async () => {
  let now = 1000, release;
  const scheduler = new BrowserScheduler({ now: () => now, maxQueueMs: 1000 });
  const first = scheduler.run('active', () => new Promise(resolve => { release = resolve; }));
  let dispatched = false;
  const capture = scheduler.run('expired', () => { dispatched = true; }, { cleanup: true, hardDeadline: 1010 });
  const rejected = assert.rejects(capture, { code: 'OPERATION_DEADLINE', dispatched: false });
  scheduler.cancelOwner('expired');
  now = 1010; release();
  await first; await rejected;
  assert.equal(dispatched, false);
  assert.equal(scheduler.queue.length, 0);
});

test('the hard-deadline timer bounds drain queue wait independently of task cancellation', async () => {
  const scheduler = new BrowserScheduler({ maxQueueMs: 1000 });
  let release, dispatched = false;
  const first = scheduler.run('active', () => new Promise(resolve => { release = resolve; }));
  const capture = scheduler.run('finished-task', () => { dispatched = true; }, { cleanup: true, hardDeadline: Date.now() + 20 });
  const rejected = assert.rejects(capture, { code: 'OPERATION_DEADLINE', dispatched: false });
  scheduler.cancelOwner('finished-task');
  try { await rejected; assert.equal(dispatched, false); assert.equal(scheduler.queue.length, 0); }
  finally { release(); await first; }
});

test('a queued operation runs in the async context that enqueued it, not the releasing one', async () => {
  const { AsyncLocalStorage } = await import('node:async_hooks');
  const scheduler = new BrowserScheduler(), requests = new AsyncLocalStorage();
  let release, seen;
  const first = requests.run('aborted-request', () => scheduler.run('task', () => new Promise(resolve => { release = resolve; })));
  const cleanup = requests.run('cleanup', () => scheduler.run('task', async () => { seen = requests.getStore(); }, { cleanup: true }));
  await new Promise(resolve => setImmediate(resolve));
  release(); await first; await cleanup;
  assert.equal(seen, 'cleanup');
});

test('re-entrant operations of the active owner still run without re-queueing', async () => {
  const scheduler = new BrowserScheduler();
  const result = await scheduler.run('task', () => scheduler.run('task', async () => 'nested'));
  assert.equal(result, 'nested');
});
