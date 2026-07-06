/**
 * Phase 11 FINT-21 -- pure-helper sidecar for the side panel's per-tab
 * conversation state envelope.
 *
 * Storage key: 'fsbSidepanelTabConversations' (CONTEXT D-01).
 * Envelope: { v: 1, byTab: { '<tabIdStr>': entry, ... }, lru: ['<tabIdStr>', ...] } (D-02).
 * Entry: { conversationId, lastAccessAt, createdAt } (D-03).
 * Cap: 50 tabs; tail-eviction on 51st insert (D-04).
 * Lazy mint: convId minted on first user message in tab (D-17).
 *
 * Test-seam: storage I/O flows through injected callbacks
 * (storageReadFn / storageWriteFn / storageRemoveFn) so Node tests
 * mock without touching extension host globals.
 *
 * Classic-script load shape: registers on globalThis for sidepanel
 * consumption AND exports for Node tests. Mirrors owner-chip.js.
 */
(function(global) {
  'use strict';

  var STORAGE_KEY = 'fsbSidepanelTabConversations';
  var LEGACY_KEY = 'fsbSidepanelConversationId';
  var DEFAULT_CAP = 50;
  var ENVELOPE_VERSION = 1;

  /**
   * Produce a fresh empty envelope. New object every call so callers cannot
   * accidentally share state through a shared reference.
   * @returns {object} { v: 1, byTab: {}, lru: [] }
   */
  function emptyEnvelope() {
    return { v: ENVELOPE_VERSION, byTab: {}, lru: [] };
  }

  /**
   * Defensive shape check. Required at every public-API entry so corrupted
   * envelopes (e.g., from DevTools-mutated storage) degrade safely.
   * @param {*} env
   * @returns {boolean}
   */
  function isValidEnvelope(env) {
    if (!env || typeof env !== 'object') return false;
    if (env.v !== ENVELOPE_VERSION) return false;
    if (!env.byTab || typeof env.byTab !== 'object') return false;
    if (!Array.isArray(env.lru)) return false;
    return true;
  }

  /**
   * Normalize a tabId into a string key. Accepts number or non-empty string.
   * Returns null on invalid input.
   * @param {*} tabId
   * @returns {string|null}
   */
  function _normalizeTabId(tabId) {
    if (tabId === null || tabId === undefined) return null;
    if (typeof tabId === 'number') {
      if (!Number.isFinite(tabId) || tabId <= 0) return null;
      return String(tabId);
    }
    if (typeof tabId === 'string') {
      if (tabId.length === 0) return null;
      return tabId;
    }
    return null;
  }

  /**
   * Move the tabId to the head of the LRU list (MRU position). Idempotent on
   * missing. Mutates envelope.lru in place.
   * @param {object} envelope
   * @param {string|number} tabId
   */
  function _touchLru(envelope, tabId) {
    if (!isValidEnvelope(envelope)) return;
    var key = _normalizeTabId(tabId);
    if (key === null) return;
    var idx = envelope.lru.indexOf(key);
    if (idx !== -1) envelope.lru.splice(idx, 1);
    envelope.lru.unshift(key);
  }

  /**
   * Drop entries beyond `cap` from the tail (LRU end). Idempotent. Also reaps
   * any byTab entries not present in the lru array (defense vs corruption).
   * Mutates envelope in place.
   * @param {object} envelope
   * @param {number} cap
   */
  function _enforceLruCap(envelope, cap) {
    if (!isValidEnvelope(envelope)) return;
    var effectiveCap = (typeof cap === 'number' && cap >= 0) ? cap : DEFAULT_CAP;
    while (envelope.lru.length > effectiveCap) {
      var tailKey = envelope.lru.pop();
      if (tailKey) delete envelope.byTab[tailKey];
    }
    var lruSet = {};
    for (var i = 0; i < envelope.lru.length; i++) lruSet[envelope.lru[i]] = true;
    var byTabKeys = Object.keys(envelope.byTab);
    for (var j = 0; j < byTabKeys.length; j++) {
      if (!lruSet[byTabKeys[j]]) delete envelope.byTab[byTabKeys[j]];
    }
  }

  /**
   * Default conversationId minter. Matches the existing
   * 'conv_<timestamp>_<rand>' format minted by sidepanel.js.
   * @returns {string}
   */
  function _defaultMint() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Lazy mint a new entry on first call OR touch the existing entry's
   * lastAccessAt. Mutates envelope in place and enforces the LRU cap.
   * @param {object} envelope
   * @param {string|number} tabId
   * @param {function} [mintFn] - () => string (defaults to _defaultMint)
   * @returns {string|null}  conversationId, or null on invalid input
   */
  function ensureTabConversation(envelope, tabId, mintFn) {
    if (!isValidEnvelope(envelope)) return null;
    var key = _normalizeTabId(tabId);
    if (key === null) return null;
    var mint = (typeof mintFn === 'function') ? mintFn : _defaultMint;
    var entry = envelope.byTab[key];
    var now = Date.now();
    if (!entry) {
      entry = {
        conversationId: mint(),
        createdAt: now,
        lastAccessAt: now
      };
      envelope.byTab[key] = entry;
    } else {
      entry.lastAccessAt = now;
    }
    _touchLru(envelope, key);
    _enforceLruCap(envelope, DEFAULT_CAP);
    return entry.conversationId;
  }

  /**
   * Peek-only fetch. NO mint. NO LRU touch. Returns null on missing or
   * malformed entry.
   * @param {object} envelope
   * @param {string|number} tabId
   * @returns {string|null}
   */
  function getTabConversation(envelope, tabId) {
    if (!isValidEnvelope(envelope)) return null;
    var key = _normalizeTabId(tabId);
    if (key === null) return null;
    var entry = envelope.byTab[key];
    if (!entry || typeof entry.conversationId !== 'string') return null;
    return entry.conversationId;
  }

  /**
   * Remove the entry from byTab + the lru order. Idempotent on missing.
   * Mutates envelope in place.
   * @param {object} envelope
   * @param {string|number} tabId
   */
  function dropTabConversation(envelope, tabId) {
    if (!isValidEnvelope(envelope)) return;
    var key = _normalizeTabId(tabId);
    if (key === null) return;
    delete envelope.byTab[key];
    var idx = envelope.lru.indexOf(key);
    if (idx !== -1) envelope.lru.splice(idx, 1);
  }

  /**
   * Migrate from the legacy single-key 'fsbSidepanelConversationId' to the
   * Phase 11 envelope. Idempotent: safe to call on every boot.
   *
   * If the legacy key is present AND no entry exists for activeTabId, the
   * legacy conversationId is preserved under activeTabId. After migration the
   * legacy key is removed. Best-effort: storage failures degrade to returning
   * the in-memory envelope so the caller can proceed.
   *
   * @param {function} storageReadFn   async (keys: string[]) => Promise<bag>
   * @param {function} storageWriteFn  async (payload: object) => Promise<void>
   * @param {function} storageRemoveFn async (key: string) => Promise<void>
   * @param {number|string|null} activeTabId
   * @returns {Promise<object>} post-migration envelope
   */
  async function migrateLegacyConversationKey(storageReadFn, storageWriteFn, storageRemoveFn, activeTabId) {
    if (typeof storageReadFn !== 'function'
        || typeof storageWriteFn !== 'function'
        || typeof storageRemoveFn !== 'function') {
      return emptyEnvelope();
    }
    var bag;
    try {
      bag = await storageReadFn([LEGACY_KEY, STORAGE_KEY]);
    } catch (_e) {
      return emptyEnvelope();
    }
    var envelope = bag && bag[STORAGE_KEY];
    if (!isValidEnvelope(envelope)) {
      envelope = emptyEnvelope();
    }
    var legacyConvId = bag && bag[LEGACY_KEY];
    var normalizedActive = _normalizeTabId(activeTabId);
    if (legacyConvId && typeof legacyConvId === 'string' && normalizedActive) {
      if (!envelope.byTab[normalizedActive]) {
        var now = Date.now();
        envelope.byTab[normalizedActive] = {
          conversationId: legacyConvId,
          createdAt: now,
          lastAccessAt: now
        };
        _touchLru(envelope, normalizedActive);
      }
    }
    try {
      var payload = {};
      payload[STORAGE_KEY] = envelope;
      await storageWriteFn(payload);
      if (legacyConvId) {
        await storageRemoveFn(LEGACY_KEY);
      }
    } catch (_e) {
      // Best-effort: failed write returns the in-memory envelope so caller can proceed.
    }
    return envelope;
  }

  var exportsObj = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEY: LEGACY_KEY,
    DEFAULT_CAP: DEFAULT_CAP,
    ENVELOPE_VERSION: ENVELOPE_VERSION,
    emptyEnvelope: emptyEnvelope,
    isValidEnvelope: isValidEnvelope,
    ensureTabConversation: ensureTabConversation,
    getTabConversation: getTabConversation,
    dropTabConversation: dropTabConversation,
    _touchLru: _touchLru,
    _enforceLruCap: _enforceLruCap,
    migrateLegacyConversationKey: migrateLegacyConversationKey
  };

  global.FSBSidepanelTabConvStore = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
