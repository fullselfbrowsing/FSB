(function(root) {
  'use strict';

  // A delegated agent registers owning zero tabs, so its only legal first move is
  // open_tab -- which is why it used to strand the user's page and work in a fresh
  // one. This holds the side panel's active tab against the delegation id just long
  // enough for the agent to register, then hands that tab over.
  //
  // The tab id never crosses a message boundary: it is produced and consumed inside
  // the same service worker, so it cannot be forged by a caller. Nothing here is
  // persisted -- a worker eviction between start and register simply falls back to
  // today's open_tab behaviour.

  var SEED_TTL_MS = 120000;
  var SEED_LIMIT = 8;
  var DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
  var RESTRICTED_URL_PATTERN =
    /^(?:chrome|chrome-extension|edge|brave|about|file|devtools|view-source):/i;

  var seeds = new Map();

  function clock(value) {
    return Number.isFinite(value) ? value : Date.now();
  }

  function isValidDelegationId(value) {
    return typeof value === 'string' && DELEGATION_ID_PATTERN.test(value);
  }

  function isValidTabId(value) {
    return Number.isSafeInteger(value) && value >= 0;
  }

  function purgeExpired(now) {
    var current = clock(now);
    seeds.forEach(function(record, delegationId) {
      if (record.expiresAt <= current) seeds.delete(delegationId);
    });
  }

  function reserve(input, now) {
    purgeExpired(now);
    if (!input || typeof input !== 'object') return false;
    if (!isValidDelegationId(input.delegationId) || !isValidTabId(input.tabId)) return false;
    if (seeds.has(input.delegationId)) return false;
    if (seeds.size >= SEED_LIMIT) return false;
    seeds.set(input.delegationId, {
      tabId: input.tabId,
      expiresAt: clock(now) + SEED_TTL_MS
    });
    return true;
  }

  function consume(delegationId, now) {
    purgeExpired(now);
    if (!isValidDelegationId(delegationId)) return null;
    var record = seeds.get(delegationId);
    if (!record) return null;
    seeds.delete(delegationId);
    return record.tabId;
  }

  function forget(delegationId) {
    if (!isValidDelegationId(delegationId)) return false;
    return seeds.delete(delegationId);
  }

  function size() {
    return seeds.size;
  }

  function clear() {
    seeds.clear();
  }

  function isRestrictedUrl(value) {
    return typeof value !== 'string' || value === '' || RESTRICTED_URL_PATTERN.test(value);
  }

  // Returns null for every refusal, which means "leave the agent owning nothing and
  // let it open its own tab", i.e. exactly today's behaviour.
  async function adopt(input) {
    if (!input || typeof input !== 'object') return null;
    var registry = input.registry;
    var tabsApi = input.tabsApi;
    if (!registry || !tabsApi || typeof tabsApi.get !== 'function') return null;
    if (typeof registry.bindTab !== 'function' || typeof registry.getOwner !== 'function') {
      return null;
    }
    if (typeof input.agentId !== 'string' || !input.agentId) return null;

    var tabId = consume(input.delegationId);
    if (tabId === null) return null;

    var tab = null;
    try {
      tab = await tabsApi.get(tabId);
    } catch (_error) {
      return null;
    }
    if (!tab || tab.id !== tabId) return null;
    if (tab.incognito === true) return null;

    var restrictionCheck = typeof input.isRestrictedUrl === 'function'
      ? input.isRestrictedUrl
      : isRestrictedUrl;
    if (restrictionCheck(tab.url || tab.pendingUrl || '')) return null;

    if (typeof input.hasLiveSession === 'function' && input.hasLiveSession(tabId) === true) {
      return null;
    }

    var owner = null;
    try {
      owner = await Promise.resolve(registry.getOwner(tabId));
    } catch (_error) {
      return null;
    }
    if (typeof owner === 'string' && owner) {
      // Only the popup/side-panel/autopilot surfaces hand a tab over. A real agent's
      // tab is never displaced.
      if (owner.indexOf('legacy:') !== 0) return null;
      try {
        await Promise.resolve(registry.releaseTab(tabId));
      } catch (_error) {
        return null;
      }
      var afterRelease = null;
      try {
        afterRelease = await Promise.resolve(registry.getOwner(tabId));
      } catch (_error) {
        return null;
      }
      // A hold lease makes releaseTab a no-op, so re-read rather than assume.
      if (afterRelease) return null;
    }

    var bound = null;
    try {
      bound = await Promise.resolve(registry.bindTab(input.agentId, tabId, { forced: true }));
    } catch (_error) {
      return null;
    }
    if (!bound || typeof bound.ownershipToken !== 'string') return null;
    return { tabId: tabId, ownershipToken: bound.ownershipToken };
  }

  var api = {
    SEED_TTL_MS: SEED_TTL_MS,
    SEED_LIMIT: SEED_LIMIT,
    reserve: reserve,
    consume: consume,
    forget: forget,
    size: size,
    clear: clear,
    purgeExpired: purgeExpired,
    isRestrictedUrl: isRestrictedUrl,
    adopt: adopt
  };

  root.FsbDelegationTabSeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
