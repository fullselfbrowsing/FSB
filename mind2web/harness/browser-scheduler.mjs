import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';

const clock = () => ({ utc: new Date().toISOString(), monotonic_ms: performance.now() });
const failure = (code, message) => Object.assign(new Error(message), { code, dispatched: false });

// One process owns this scheduler and all task gateways. FIFO ordering bounds starvation.
export class BrowserScheduler {
  constructor({ maxQueueMs = 60_000, now = () => Date.now() } = {}) {
    this.maxQueueMs = maxQueueMs; this.now = now; this.queue = []; this.active = null;
    this.context = new AsyncLocalStorage(); this.cancelled = new Set(); this.halted = null;
  }
  halt(reason) {
    this.halted ||= reason;
    for (const item of [...this.queue]) this.remove(item, failure('BROWSER_HALTED', reason));
  }
  cancelOwner(owner) {
    this.cancelled.add(owner);
    for (const item of [...this.queue]) if (item.owner === owner && !item.cleanup) this.remove(item, failure('TASK_DEADLINE', 'Task no longer accepts browser operations'));
  }
  assertCanDispatch(owner, deadline = Infinity) {
    if (this.halted) throw failure('BROWSER_HALTED', this.halted);
    if (this.cancelled.has(owner) || this.now() >= deadline) throw failure('TASK_DEADLINE', 'Task no longer accepts new browser work');
  }
  remove(item, error) {
    const index = this.queue.indexOf(item);
    if (index < 0) return;
    this.queue.splice(index, 1); clearTimeout(item.timer); item.reject(error);
  }
  async run(owner, operation, { deadline = Infinity, hardDeadline = Infinity, cleanup = false, timing = {} } = {}) {
    if (this.now() >= hardDeadline) throw failure('OPERATION_DEADLINE', 'Operation deadline reached before foreground acquisition');
    if (this.context.getStore() === this.active && this.active?.owner === owner) return operation(timing);
    if (this.halted && !cleanup) throw failure('BROWSER_HALTED', this.halted);
    if (!cleanup && (this.cancelled.has(owner) || this.now() >= deadline)) throw failure('TASK_DEADLINE', 'Task deadline reached before dispatch');
    timing.lease_requested = clock();
    return new Promise((resolve, reject) => {
      // pump() starts the next item from the previous item's finally block, so
      // each operation must run in the async context that enqueued it, not in
      // the releasing request's (possibly cancelled) context.
      const item = { owner, operation, deadline, hardDeadline, cleanup, timing, resolve, reject, enqueued: AsyncLocalStorage.snapshot() };
      const wait = Math.max(0, Math.min(this.maxQueueMs, hardDeadline - this.now(), cleanup ? Infinity : deadline - this.now()));
      item.timer = setTimeout(() => this.remove(item, failure(this.now() >= hardDeadline ? 'OPERATION_DEADLINE'
        : this.now() >= deadline ? 'TASK_DEADLINE' : 'BROWSER_QUEUE_TIMEOUT', 'Browser operation expired in the foreground queue before dispatch')), wait);
      this.queue.push(item); this.pump();
    });
  }
  pump() {
    if (this.active) return;
    const item = this.queue.shift();
    if (!item) return;
    clearTimeout(item.timer);
    if (this.now() >= item.hardDeadline) {
      item.reject(failure('OPERATION_DEADLINE', 'Operation deadline reached before foreground acquisition')); this.pump(); return;
    }
    if ((!item.cleanup && (this.halted || this.cancelled.has(item.owner) || this.now() >= item.deadline))) {
      item.reject(failure('TASK_DEADLINE', this.halted || 'Task deadline reached before foreground acquisition')); this.pump(); return;
    }
    this.active = item; item.timing.lease_acquired = clock();
    item.enqueued(() => this.context.run(item, async () => {
      try { item.resolve(await item.operation(item.timing)); }
      catch (error) { item.reject(error); }
      finally { item.timing.lease_released = clock(); this.active = null; this.pump(); }
    }));
  }
}

export { clock as operationClock };
