/** Shared debugger connections for FSB-controlled tabs. Callers hold the CDP lease. */
(function initDebuggerSessions(root) {
  'use strict';

  const sessions = new Map();
  const retained = new Set();

  function owned(tabId) {
    return !!root.fsbAgentRegistryInstance?.getOwner?.(tabId);
  }

  async function attach(target, protocol = '1.3') {
    const tabId = target.tabId;
    if (owned(tabId)) retained.add(tabId);
    const existing = sessions.get(tabId);
    if (existing) return existing.attaching;
    const state = { ready: false };
    sessions.set(tabId, state);
    state.attaching = root.chrome.debugger.attach(target, protocol).catch(error => {
      if (sessions.get(tabId) === state) sessions.delete(tabId);
      throw error;
    });
    return state.attaching;
  }

  async function detach(target, force = false) {
    const tabId = target.tabId;
    if (!force && (retained.has(tabId) || owned(tabId))) return;
    const state = sessions.get(tabId);
    if (!state) return; // Never detach a debugger this module did not attach.
    await state.attaching.catch(() => {});
    if (sessions.get(tabId) !== state) return;
    sessions.delete(tabId);
    await root.chrome.debugger.detach(target);
  }

  async function retain(tabId) {
    const lease = await root.FsbCdpLease.acquire(tabId, { timeoutMs: 1000, holdMs: 5000 });
    let timer;
    try {
      retained.add(tabId);
      await attach({ tabId });
      const state = sessions.get(tabId);
      if (state?.ready) return;
      // Browser-side attach success precedes renderer initialization. Require
      // a renderer acknowledgement before allowing an action to start a loop.
      await Promise.race([
        root.chrome.debugger.sendCommand({ tabId }, 'Runtime.enable'),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Debugger session initialization timed out')), 2000); })
      ]);
      if (!state || sessions.get(tabId) !== state) throw new Error('Debugger detached during session initialization');
      state.ready = true;
      root.automationLogger?.debug('Controlled tab debugger established', { tabId });
    } catch (error) {
      retained.delete(tabId);
      try { await detach({ tabId }, true); } catch (_error) { /* target may have closed */ }
      throw error;
    } finally {
      clearTimeout(timer);
      lease.release();
    }
  }

  async function releaseUnowned() {
    for (const tabId of retained) {
      if (owned(tabId)) continue;
      retained.delete(tabId);
      await root.FsbCdpLease.run(tabId, async () => {
        // Ownership may change while waiting for an in-flight operation.
        if (!owned(tabId) && !retained.has(tabId)) await detach({ tabId });
      }).catch(() => {});
    }
  }

  root.chrome?.debugger?.onDetach?.addListener(source => {
    sessions.delete(source.tabId);
    retained.delete(source.tabId);
  });
  root.chrome?.tabs?.onRemoved?.addListener(tabId => {
    sessions.delete(tabId);
    retained.delete(tabId);
  });

  const api = { attach, detach, retain, releaseUnowned,
    isAttachedTo: tabId => sessions.has(tabId),
    isReady: tabId => sessions.get(tabId)?.ready === true };
  root.FsbDebuggerSessions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
