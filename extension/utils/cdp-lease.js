/**
 * Per-tab FIFO lease for operations that require chrome.debugger.
 *
 * A lease serializes FSB-owned CDP work without detaching another debugger.
 * Waiting is bounded so callers can report a retryable busy error instead of
 * leaving an agent turn blocked indefinitely.
 */
(function initFsbCdpLease(root) {
  'use strict';

  const queues = new Map();
  const DEFAULT_HOLD_MS = 20000;

  function busyError(tabId) {
    const error = new Error(`The debugger for tab ${tabId} is busy. Retry the operation.`);
    error.name = 'ScreenshotDebuggerBusyError';
    error.code = 'SCREENSHOT_DEBUGGER_BUSY';
    error.retryable = true;
    return error;
  }

  function holdMsFrom(options) {
    return Number.isFinite(options.holdMs) && options.holdMs > 0
      ? options.holdMs
      : DEFAULT_HOLD_MS;
  }

  // The watchdog frees the tab from a holder that hung. Holders whose work
  // legitimately runs longer pass holdMs so they are not preempted mid-use.
  function makeLease(tabId, state, holdMs) {
    let released = false;
    const lease = {
      tabId,
      release() {
        if (released) return;
        released = true;
        clearTimeout(watchdog);

        while (state.waiters.length > 0) {
          const waiter = state.waiters.shift();
          if (waiter.cancelled) continue;
          clearTimeout(waiter.timer);
          waiter.resolve(makeLease(tabId, state, waiter.holdMs));
          return;
        }

        state.active = false;
        queues.delete(tabId);
      }
    };
    const watchdog = setTimeout(() => lease.release(), holdMs);
    if (typeof watchdog.unref === 'function') watchdog.unref();
    return lease;
  }

  function acquire(tabId, options = {}) {
    if (!Number.isInteger(tabId) || tabId <= 0) {
      return Promise.reject(new TypeError('A positive integer tabId is required for a CDP lease'));
    }

    const timeoutMs = Number.isFinite(options.timeoutMs)
      ? Math.max(0, options.timeoutMs)
      : 10000;
    const holdMs = holdMsFrom(options);
    let state = queues.get(tabId);
    if (!state) {
      state = { active: false, waiters: [] };
      queues.set(tabId, state);
    }

    if (!state.active) {
      state.active = true;
      return Promise.resolve(makeLease(tabId, state, holdMs));
    }

    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, holdMs, cancelled: false, timer: null };
      waiter.timer = setTimeout(() => {
        waiter.cancelled = true;
        reject(busyError(tabId));
      }, timeoutMs);
      state.waiters.push(waiter);
    });
  }

  async function run(tabId, operation, options) {
    const lease = await acquire(tabId, options);
    try {
      return await operation();
    } finally {
      lease.release();
    }
  }

  const api = { acquire, run, busyError, _queues: queues };
  root.FsbCdpLease = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
