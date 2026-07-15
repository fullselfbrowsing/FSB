(function(global) {
  'use strict';

  /**
   * Phase 237 plan 01 + 02 -- agent registry foundation with storage write-
   * through and SW-wake reconciliation.
   *
   * Keystone module that owns "who owns which tab" for v0.9.60 multi-agent
   * tab concurrency.
   *
   *   - In-memory Maps (agents, tabOwners, tabsByAgent)
   *   - registerAgent / releaseAgent / bindTab / releaseTab
   *   - isOwnedBy / getOwner / getAgentTabs / listAgents
   *   - formatAgentIdForDisplay (D-02 canonical 6-char prefix helper)
   *   - withRegistryLock (4-line promise-chain mutex; serializes all
   *     mutating ops within the single-threaded MV3 service worker)
   *   - chrome.storage.session write-through under FSB_AGENT_REGISTRY_STORAGE_KEY
   *     in versioned envelope { v: 1, records: { ... } } (AGENT-02)
   *   - hydrate() rebuilds Maps from storage and reconciles against
   *     chrome.tabs.query({}); ghost records are dropped from BOTH in-memory
   *     Maps AND storage. Each drop emits an agent:reaped event through the
   *     existing Phase 211 LOG-04 ring buffer via rateLimitedWarn (AGENT-03).
   *
   * Background.js wiring lands in plan 03.
   *
   * Per CONTEXT.md D-01: file path is utils/, sibling to mcp-visual-session.js
   * (the legacy sunset directory is intentionally avoided).
   *
   * Per CONTEXT.md D-03: ghost-record drops emit through rateLimitedWarn with
   * per-reason category 'agent-reaped-<reason>' so different drop reasons
   * surface independently in the diagnostics ring.
   *
   * Per CONTEXT.md D-04: registry is connection-agnostic in Phase 237.
   * The MCP-transport linkage field lands cleanly in Phase 241.
   */

  // ---- Constants ----------------------------------------------------------

  var FSB_AGENT_REGISTRY_STORAGE_KEY = 'fsbAgentRegistry';
  var FSB_AGENT_REGISTRY_PAYLOAD_VERSION = 1;
  var FSB_AGENT_ID_PREFIX = 'agent_';
  var FSB_AGENT_DISPLAY_HEX_LENGTH = 6;
  var FSB_AGENT_LOG_PREFIX = 'AGT';
  var FSB_AGENT_REAP_RATE_LIMIT_CATEGORY_BASE = 'agent-reaped';
  var FSB_DELEGATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
  var FSB_HOLD_LEASE_VERSION = 1;
  var FSB_HOLD_LEASE_MS = 5 * 60 * 1000;

  // Phase 241 plan 01: cap + grace constants ---------------------------------
  // D-05: cap is persisted in chrome.storage.local under fsbAgentCap so it
  // survives SW restart. NOT chrome.storage.session (which is wiped on wake).
  // D-07: 10s grace. The Chrome alarms API minimum delay is 30s (Chrome 120+),
  // so we MUST use setTimeout for the staged release; hydrate-time recovery
  // covers SW eviction.
  var FSB_AGENT_CAP_STORAGE_KEY = 'fsbAgentCap';
  var FSB_AGENT_CAP_DEFAULT = 8;
  var FSB_AGENT_CAP_MIN = 1;
  var FSB_AGENT_CAP_MAX = 64;
  var RECONNECT_GRACE_MS = 10000;

  // LOG-04 category constants (D-04, D-09, Q3 resolution).
  var FSB_AGENT_CAP_REACHED_CATEGORY = 'agent-cap-reached';
  var FSB_AGENT_CAP_LOWERED_CATEGORY = 'agent-cap-lowered-grandfathered';
  var FSB_AGENT_GRACE_EXPIRED_CATEGORY = 'agent-grace-expired';

  // Phase 243 WR-02: module-scope guards for the chrome.storage.onChanged cap
  // listener. _capListenerAttached ensures at most ONE listener is attached
  // per SW classloader lifetime. _capListenerLiveSelf is the live registry
  // instance the listener should mutate; refreshed every constructor call so
  // re-instantiation (test harness or post-SW-wake) routes events to the
  // latest registry without leaking stale `self` captures into the listener.
  var _capListenerAttached = false;
  var _capListenerLiveSelf = null;

  function _clampCap(v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return FSB_AGENT_CAP_DEFAULT;
    var i = Math.floor(v);
    if (i < FSB_AGENT_CAP_MIN) return FSB_AGENT_CAP_MIN;
    if (i > FSB_AGENT_CAP_MAX) return FSB_AGENT_CAP_MAX;
    return i;
  }

  // ---- Storage helpers (mirror background.js:563-591 with v: 1 envelope) --
  //
  // Both helpers reference globalThis.chrome lazily so the module loads
  // cleanly under Node test harnesses where chrome is mocked AFTER module
  // load. Errors are swallowed to a return-null / no-op posture; the SW
  // boot path must NEVER be poisoned by a storage hiccup.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  function _getCapRecommendationModule() {
    if (global && global.FsbAgentCapRecommendation) return global.FsbAgentCapRecommendation;
    if (typeof globalThis !== 'undefined' && globalThis.FsbAgentCapRecommendation) {
      return globalThis.FsbAgentCapRecommendation;
    }
    return null;
  }

  async function _resolveRecommendedCap() {
    var recommendation = _getCapRecommendationModule();
    if (recommendation && typeof recommendation.getRecommendedAgentCap === 'function') {
      try {
        return _clampCap(await recommendation.getRecommendedAgentCap());
      } catch (_e) {
        return FSB_AGENT_CAP_DEFAULT;
      }
    }
    return FSB_AGENT_CAP_DEFAULT;
  }

  async function readPersistedAgentRegistry() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session || typeof c.storage.session.get !== 'function') {
      return null;
    }
    try {
      var stored = await c.storage.session.get([FSB_AGENT_REGISTRY_STORAGE_KEY]);
      var payload = stored ? stored[FSB_AGENT_REGISTRY_STORAGE_KEY] : null;
      if (!payload || typeof payload !== 'object') return null;
      if (payload.v !== FSB_AGENT_REGISTRY_PAYLOAD_VERSION) return null;
      return payload;
    } catch (_e) {
      return null;
    }
  }

  async function writePersistedAgentRegistry(records, extras, strict) {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session) {
      if (strict === true) throw new Error('Agent registry session storage unavailable');
      return;
    }
    try {
      var nextRecords = (records && typeof records === 'object') ? records : {};
      var nextExtras = (extras && typeof extras === 'object') ? extras : {};
      if (Object.keys(nextRecords).length === 0 && Object.keys(nextExtras).length === 0) {
        if (typeof c.storage.session.remove === 'function') {
          await c.storage.session.remove(FSB_AGENT_REGISTRY_STORAGE_KEY);
        } else if (strict === true) {
          throw new Error('Agent registry session removal unavailable');
        }
        return;
      }
      var envelope = {
        v: FSB_AGENT_REGISTRY_PAYLOAD_VERSION,
        records: nextRecords
      };
      // Phase 240 D-04: additive extras (tabMetadata) carried at the
      // envelope's top level. v: 1 unchanged because older readers ignore
      // unknown fields.
      if (nextExtras && typeof nextExtras === 'object') {
        Object.keys(nextExtras).forEach(function(key) {
          envelope[key] = nextExtras[key];
        });
      }
      var payload = {};
      payload[FSB_AGENT_REGISTRY_STORAGE_KEY] = envelope;
      if (typeof c.storage.session.set === 'function') {
        await c.storage.session.set(payload);
      } else if (strict === true) {
        throw new Error('Agent registry session write unavailable');
      }
    } catch (error) {
      if (strict === true) throw error;
      // best-effort; do not throw
    }
  }

  // ---- Diagnostic emission (RESEARCH.md Pattern 5 Option A; CONTEXT.md D-03)
  //
  // Lazy-references globalThis.rateLimitedWarn so a module load order issue
  // (Pitfall 5) does not crash the reaping path. Reaping is mandatory; the
  // diagnostic is best-effort.

  function emitAgentReapedEvent(agentId, tabId, reason) {
    var event = {
      type: 'agent:reaped',
      agentId: agentId,
      tabId: tabId,
      reason: reason,
      timestamp: Date.now(),
      agentIdShort: formatAgentIdForDisplay(agentId)
    };
    if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
      try {
        globalThis.rateLimitedWarn(
          FSB_AGENT_LOG_PREFIX,
          FSB_AGENT_REAP_RATE_LIMIT_CATEGORY_BASE + '-' + reason,
          'agent reaped',
          { agentIdShort: event.agentIdShort, tabId: tabId, reason: reason }
        );
      } catch (_e) { /* swallow */ }
    }
    return event;
  }

  // ---- Promise-chain mutex (RESEARCH.md Pattern 3 verbatim) ---------------
  //
  // Module-scope (NOT instance-scope). The MV3 service worker is single-
  // threaded; one chain serializes all callers across all registry instances.
  // After SW eviction, the chain is reborn as Promise.resolve() -- correct
  // because no operations are in-flight on a freshly-spawned SW.
  //
  // The .then(fn, fn) shape runs the next handler whether the prior one
  // fulfilled or rejected, so a single thrown handler does NOT poison the
  // chain. The .catch(() => {}) on assignment ensures _registryChain itself
  // never holds a rejected promise (which would leak to UnhandledRejection).

  var _registryChain = Promise.resolve();
  function withRegistryLock(fn) {
    var next = _registryChain.then(fn, fn);
    _registryChain = next.catch(function() { /* swallow so chain continues */ });
    return next;
  }

  // ---- Display helper (D-02 canonical) ------------------------------------
  //
  // Single source of truth for short-prefix display. UI / log call sites
  // MUST use this helper rather than slicing IDs locally. Phase 243 (badge)
  // and Phase 244 (MCP tool descriptions) both consume it.

  function formatAgentIdForDisplay(agentId) {
    if (typeof agentId !== 'string') return '';
    if (agentId.indexOf(FSB_AGENT_ID_PREFIX) !== 0) return '';
    var hex = agentId.slice(FSB_AGENT_ID_PREFIX.length).replace(/-/g, '');
    return FSB_AGENT_ID_PREFIX + hex.slice(0, FSB_AGENT_DISPLAY_HEX_LENGTH);
  }

  // ---- AgentRecord helpers ------------------------------------------------

  function isPositiveInteger(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && Math.floor(value) === value;
  }

  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  function hasExactKeys(value, expected) {
    if (!isPlainObject(value)) return false;
    var actual = Object.keys(value).sort();
    var wanted = expected.slice().sort();
    return actual.length === wanted.length && actual.every(function(key, index) {
      return key === wanted[index];
    });
  }

  function isDelegationId(value) {
    return typeof value === 'string' && FSB_DELEGATION_ID_PATTERN.test(value);
  }

  function cloneRecord(record) {
    if (!record || typeof record !== 'object') return null;
    try {
      return JSON.parse(JSON.stringify(record));
    } catch (_err) {
      return null;
    }
  }

  function mintAgentId() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return FSB_AGENT_ID_PREFIX + crypto.randomUUID();
    }
    // Defensive fallback. Should never trigger in MV3 SW or Node 18+ (both
    // expose crypto.randomUUID natively). Kept so the module never throws.
    var rand = Math.random().toString(16).slice(2, 10);
    var stamp = Date.now().toString(16);
    return FSB_AGENT_ID_PREFIX + stamp + '-' + rand;
  }

  // Phase 240 D-04: per-bindTab opaque ownershipToken. Defense-in-depth so a
  // stolen agentId alone does not pass the dispatch gate. Distinct generator
  // from mintAgentId -- token format is a bare UUID (no agent_ prefix).
  function mintOwnershipToken() {
    if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    var rand = Math.random().toString(16).slice(2, 10);
    var stamp = Date.now().toString(16);
    return stamp + '-' + rand;
  }

  // ---- AgentRegistry constructor ------------------------------------------
  //
  // Mirrors mcp-visual-session.js:85-88 -- the v0.9.36 storage-keyed manager
  // pattern. Three Maps form the in-memory authoritative state:
  //
  //   _agents      : agentId  -> AgentRecord { agentId, createdAt, tabIds,
  //                    selectedTabId? }
  //   _tabOwners   : tabId    -> agentId      (AUTHORITATIVE owner index)
  //   _tabsByAgent : agentId  -> Set<tabId>   (reverse index for fast lookup)
  //
  // _hydrated flips true after hydrate() runs (plan 02 enforces "must hydrate
  // before serving requests"; in plan 01 the flag is informational only).

  function AgentRegistry(options) {
    options = options || {};
    this._agents = new Map();
    this._tabOwners = new Map();
    this._tabsByAgent = new Map();
    // Phase 240 D-04: per-tab metadata cache. tabId -> {ownershipToken,
    // incognito, windowId, boundAt}. Sibling Map (not nested in agent record)
    // so getTabMetadata stays a single Map.get(tabId) sync read for the
    // dispatch gate's same-microtask discipline (D-07).
    this._tabMetadata = new Map();
    // Phase 61: the server delegation id is correlation only. Extension-
    // minted agent ids remain authoritative for tab ownership. Both indexes
    // are kept so one-to-one conflicts fail without scanning or ambiguity.
    this._delegations = new Map();
    this._delegationByAgent = new Map();
    // Held tabs leave active automation ownership but remain reserved here.
    // Lease expiry never deletes these indexes; only exact restore/release may
    // transition them.
    this._holdLeases = new Map();
    this._heldTabDelegations = new Map();
    this._now = typeof options.now === 'function' ? options.now : Date.now;
    this._hydrated = false;
    // Phase 241 plan 01: cap + grace state.
    // _cachedCap is the in-memory mirror of chrome.storage.local fsbAgentCap.
    // It is read sync on every claim under withRegistryLock; cross-context
    // updates arrive through the chrome.storage.onChanged subscriber.
    this._cachedCap = FSB_AGENT_CAP_DEFAULT;
    // _stagedReleases keys connectionId -> { deadline, timeoutId, agentIds }.
    // Persisted shape (sans timeoutId) lives under the registry envelope's
    // stagedReleases sibling block per Q2 resolution.
    this._stagedReleases = new Map();
    // Best-effort cross-context subscriber. Guards on chrome.storage.onChanged
    // availability so Node test harnesses without the API still construct.
    this._subscribeToCapChanges();
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Register a new agent. ALWAYS mints a fresh agent_<full-uuid> via
   * crypto.randomUUID(). Caller-supplied ids are IGNORED (AGENT-01).
   * Caller-supplied opts are IGNORED in plan 01 (D-04 -- the registry is
   * connection-agnostic in Phase 237).
   *
   * @returns Promise<{ agentId, agentIdShort }>
   */
  AgentRegistry.prototype.registerAgent = function(/* opts ignored */) {
    var self = this;
    return withRegistryLock(async function() {
      // Phase 241 D-03: cap-check + insert atomic under withRegistryLock.
      // Sync reads inside the lock so 20-concurrent claims serialize cleanly.
      // Caller (mcp-tool-dispatcher.js handleAgentRegisterRoute) branches on
      // result.code per D-03's typed-error contract.
      var cap = self.getCap();
      var active = self._agents.size;
      if (active >= cap) {
        // D-04: emit one rate-limited LOG-04 diagnostic per rejection.
        // Wrapped in try/catch (Pitfall 5) so a missing globalThis.rateLimitedWarn
        // never poisons the cap-check path.
        try {
          if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
            globalThis.rateLimitedWarn(
              FSB_AGENT_LOG_PREFIX,
              FSB_AGENT_CAP_REACHED_CATEGORY,
              'agent cap reached',
              { cap: cap, active: active }
            );
          }
        } catch (_e) { /* swallow */ }
        return { error: 'AGENT_CAP_REACHED', code: 'AGENT_CAP_REACHED', cap: cap, active: active };
      }
      var agentId = mintAgentId();
      var record = {
        agentId: agentId,
        createdAt: Date.now(),
        tabIds: []
      };
      self._agents.set(agentId, record);
      self._tabsByAgent.set(agentId, new Set());
      await self._persist();
      return {
        agentId: agentId,
        agentIdShort: formatAgentIdForDisplay(agentId)
      };
    });
  };

  /**
   * Release an agent. Removes the agent and ALL of its tab bindings.
   * Idempotent: returns false if agentId is unknown, no throw.
   *
   * @returns Promise<boolean>
   */
  AgentRegistry.prototype.releaseAgent = function(agentId, _reason) {
    var self = this;
    return withRegistryLock(async function() {
      if (typeof agentId !== 'string' || !self._agents.has(agentId)) {
        return false;
      }
      var delegationId = self._delegationByAgent.get(agentId);
      if (delegationId && self._holdLeases.has(delegationId)) {
        // A generic connection/grace release cannot dissolve a confirmed
        // human-control lease. The controller must call releaseDelegation
        // with both exact identities.
        return false;
      }
      var ownedTabs = self._tabsByAgent.get(agentId);
      if (ownedTabs) {
        ownedTabs.forEach(function(tabId) {
          if (self._tabOwners.get(tabId) === agentId) {
            self._tabOwners.delete(tabId);
            // Phase 240: also wipe per-tab metadata so a recycled tabId does
            // not surface stale token bytes to a future bindTab.
            self._tabMetadata.delete(tabId);
          }
        });
      }
      self._tabsByAgent.delete(agentId);
      self._agents.delete(agentId);
      self._removeDelegationForAgent(agentId);
      await self._persist();
      return true;
    });
  };

  /**
   * Bind one daemon-minted delegation id to one already extension-minted
   * agent id. Authorization belongs to DelegationController; callers must
   * reach this method only through bindRegisteredAgent.
   */
  AgentRegistry.prototype.bindDelegation = function(input) {
    var self = this;
    return withRegistryLock(async function() {
      if (!hasExactKeys(input, ['delegationId', 'agentId'])
        || !isDelegationId(input.delegationId)
        || typeof input.agentId !== 'string'
        || !self._agents.has(input.agentId)) {
        return { ok: false, code: 'delegation_binding_rejected' };
      }
      var mappedAgent = self._delegations.get(input.delegationId);
      var mappedDelegation = self._delegationByAgent.get(input.agentId);
      if ((mappedAgent && mappedAgent !== input.agentId)
        || (mappedDelegation && mappedDelegation !== input.delegationId)) {
        return { ok: false, code: 'delegation_binding_conflict' };
      }
      if (mappedAgent === input.agentId && mappedDelegation === input.delegationId) {
        return {
          ok: true,
          code: 'delegation_already_bound',
          delegationId: input.delegationId,
          agentId: input.agentId
        };
      }
      // A half-index can exist only after memory corruption. Refuse to
      // repair it implicitly because choosing either side would broaden
      // authority.
      if (mappedAgent || mappedDelegation) {
        return { ok: false, code: 'delegation_binding_conflict' };
      }
      self._delegations.set(input.delegationId, input.agentId);
      self._delegationByAgent.set(input.agentId, input.delegationId);
      await self._persist();
      return {
        ok: true,
        code: 'delegation_bound',
        delegationId: input.delegationId,
        agentId: input.agentId
      };
    });
  };

  /** Exact read of the extension agent mapped to a server delegation. */
  AgentRegistry.prototype.getAgentForDelegation = function(delegationId) {
    if (!isDelegationId(delegationId)) return null;
    var agentId = this._delegations.get(delegationId);
    if (!agentId || !this._agents.has(agentId)) return null;
    if (this._delegationByAgent.get(agentId) !== delegationId) return null;
    return agentId;
  };

  /**
   * Return the complete active ownership snapshot for the exact mapping.
   * Missing token metadata makes the whole lookup fail closed as an empty
   * set; callers must never seal a partial token mapping.
   */
  AgentRegistry.prototype.getDelegationOwnedTabs = function(input) {
    if (!hasExactKeys(input, ['delegationId', 'agentId'])
      || !isDelegationId(input.delegationId)
      || this.getAgentForDelegation(input.delegationId) !== input.agentId) {
      return [];
    }
    var owned = this._tabsByAgent.get(input.agentId);
    if (!owned) return [];
    var out = [];
    var self = this;
    var valid = true;
    owned.forEach(function(tabId) {
      var meta = self._tabMetadata.get(tabId);
      if (self._tabOwners.get(tabId) !== input.agentId
        || !meta
        || typeof meta.ownershipToken !== 'string'
        || meta.ownershipToken.length === 0) {
        valid = false;
        return;
      }
      out.push({ tabId: tabId, ownershipToken: meta.ownershipToken });
    });
    if (!valid || out.length !== owned.size) return [];
    return out.sort(function(a, b) { return a.tabId - b.tabId; });
  };

  AgentRegistry.prototype._cloneAuthorityState = function() {
    var shadow = Object.create(AgentRegistry.prototype);
    shadow._agents = new Map();
    this._agents.forEach(function(record, agentId) {
      shadow._agents.set(agentId, cloneRecord(record));
    });
    shadow._tabOwners = new Map(this._tabOwners);
    shadow._tabsByAgent = new Map();
    this._tabsByAgent.forEach(function(tabIds, agentId) {
      shadow._tabsByAgent.set(agentId, new Set(tabIds));
    });
    shadow._tabMetadata = new Map();
    this._tabMetadata.forEach(function(meta, tabId) {
      shadow._tabMetadata.set(tabId, Object.assign({}, meta));
    });
    shadow._delegations = new Map(this._delegations);
    shadow._delegationByAgent = new Map(this._delegationByAgent);
    shadow._holdLeases = new Map();
    this._holdLeases.forEach(function(lease, delegationId) {
      shadow._holdLeases.set(delegationId, cloneRecord(lease));
    });
    shadow._heldTabDelegations = new Map(this._heldTabDelegations);
    shadow._stagedReleases = new Map();
    this._stagedReleases.forEach(function(entry, connectionId) {
      shadow._stagedReleases.set(connectionId, {
        deadline: entry.deadline,
        timeoutId: entry.timeoutId,
        agentIds: Array.isArray(entry.agentIds) ? entry.agentIds.slice() : []
      });
    });
    return shadow;
  };

  AgentRegistry.prototype._adoptAuthorityState = function(shadow) {
    this._agents = shadow._agents;
    this._tabOwners = shadow._tabOwners;
    this._tabsByAgent = shadow._tabsByAgent;
    this._tabMetadata = shadow._tabMetadata;
    this._delegations = shadow._delegations;
    this._delegationByAgent = shadow._delegationByAgent;
    this._holdLeases = shadow._holdLeases;
    this._heldTabDelegations = shadow._heldTabDelegations;
  };

  function canonicalOwnedTabs(value) {
    if (!Array.isArray(value) || value.length === 0) return null;
    var seen = new Set();
    var out = [];
    for (var index = 0; index < value.length; index += 1) {
      var tab = value[index];
      if (!hasExactKeys(tab, ['tabId', 'ownershipToken'])
        || !isPositiveInteger(tab.tabId)
        || typeof tab.ownershipToken !== 'string'
        || tab.ownershipToken.length === 0
        || seen.has(tab.tabId)) {
        return null;
      }
      seen.add(tab.tabId);
      out.push({ tabId: tab.tabId, ownershipToken: tab.ownershipToken });
    }
    return out.sort(function(a, b) { return a.tabId - b.tabId; });
  }

  function sameOwnedTabs(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    for (var index = 0; index < left.length; index += 1) {
      if (left[index].tabId !== right[index].tabId
        || left[index].ownershipToken !== right[index].ownershipToken) {
        return false;
      }
    }
    return true;
  }

  /**
   * Convert the complete active ownership set into one durable, unclaimable
   * five-minute hold lease. The controller has already proved active-tab UI
   * eligibility and confirmed daemon hold; this method performs no browser
   * active-tab query.
   */
  AgentRegistry.prototype.sealHoldLease = function(input) {
    var self = this;
    return withRegistryLock(async function() {
      if (!hasExactKeys(input, ['delegationId', 'agentId', 'activeTabId', 'ownedTabs', 'expiresAt'])
        || !isDelegationId(input.delegationId)
        || typeof input.agentId !== 'string'
        || !isPositiveInteger(input.activeTabId)) {
        return { ok: false, code: 'hold_lease_invalid' };
      }
      if (self.getAgentForDelegation(input.delegationId) !== input.agentId
        || self._holdLeases.has(input.delegationId)) {
        return { ok: false, code: 'hold_lease_mapping_changed' };
      }
      var supplied = canonicalOwnedTabs(input.ownedTabs);
      if (!supplied || !supplied.some(function(tab) { return tab.tabId === input.activeTabId; })) {
        return { ok: false, code: 'hold_lease_invalid' };
      }
      var issuedAt = self._now();
      var fixedExpiresAt = issuedAt + FSB_HOLD_LEASE_MS;
      if (!Number.isSafeInteger(issuedAt)
        || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt !== fixedExpiresAt) {
        return { ok: false, code: 'hold_lease_invalid' };
      }
      var current = canonicalOwnedTabs(self.getDelegationOwnedTabs({
        delegationId: input.delegationId,
        agentId: input.agentId
      }));
      if (!sameOwnedTabs(supplied, current)) {
        return { ok: false, code: 'hold_lease_mapping_changed' };
      }
      for (var index = 0; index < supplied.length; index += 1) {
        if (self._heldTabDelegations.has(supplied[index].tabId)) {
          return { ok: false, code: 'hold_lease_mapping_changed' };
        }
      }

      var shadow = self._cloneAuthorityState();
      var lease = {
        v: FSB_HOLD_LEASE_VERSION,
        delegationId: input.delegationId,
        agentId: input.agentId,
        activeTabId: input.activeTabId,
        ownedTabs: supplied.map(function(tab) {
          return { tabId: tab.tabId, ownershipToken: tab.ownershipToken };
        }),
        issuedAt: issuedAt,
        expiresAt: fixedExpiresAt
      };
      supplied.forEach(function(tab) {
        shadow._tabOwners.delete(tab.tabId);
        shadow._tabMetadata.delete(tab.tabId);
        shadow._heldTabDelegations.set(tab.tabId, input.delegationId);
      });
      shadow._tabsByAgent.set(input.agentId, new Set());
      var record = shadow._agents.get(input.agentId);
      if (!record) return { ok: false, code: 'hold_lease_mapping_changed' };
      record.tabIds = [];
      delete record.selectedTabId;
      shadow._holdLeases.set(input.delegationId, lease);

      try {
        await shadow._persist(true);
      } catch (_error) {
        // If a storage implementation applied then rejected, best-effort
        // rewrite of the still-authoritative pre-seal state narrows the
        // ambiguous failure. In-memory ownership was never changed.
        try { await self._persist(); } catch (_ignored) { /* best-effort */ }
        return { ok: false, code: 'hold_lease_persistence_failed' };
      }
      self._adoptAuthorityState(shadow);
      return {
        ok: true,
        code: 'hold_lease_sealed',
        expiresAt: fixedExpiresAt
      };
    });
  };

  AgentRegistry.prototype._removeDelegationForAgent = function(agentId) {
    var delegationId = this._delegationByAgent.get(agentId);
    if (!delegationId) return false;
    if (this._delegations.get(delegationId) !== agentId) return false;
    this._delegationByAgent.delete(agentId);
    this._delegations.delete(delegationId);
    return true;
  };

  /**
   * Phase 240 D-02 carve-out from Phase 238 D-12 (caller-id-ignored). The
   * three legacy surfaces (popup, sidepanel, autopilot) MUST use constant
   * agentIds 'legacy:popup' / 'legacy:sidepanel' / 'legacy:autopilot' so
   * cleanup-on-reload writes the same row back. This is the ONLY API that
   * accepts a caller-supplied agentId; everything else mints fresh via
   * registerAgent. Pitfall 4: prevents legacy:popup-{1,2,3,...} churn when
   * popup / sidepanel views are re-opened repeatedly.
   *
   * Idempotent: a second call for the same surface returns the existing
   * agentId without minting a duplicate record. Unknown surfaces return an
   * { error: 'unknown_legacy_surface' } object so the caller can surface a
   * typed rejection upstream.
   *
   * Note: ownershipToken is null at register time -- tokens are minted
   * per-bindTab. The first bindTab for the legacy agent yields the token.
   *
   * @returns Promise<{agentId, ownershipToken: null} | {error, surface}>
   */
  AgentRegistry.prototype.getOrRegisterLegacyAgent = function(surface) {
    var ALLOWED = {
      popup: 'legacy:popup',
      sidepanel: 'legacy:sidepanel',
      autopilot: 'legacy:autopilot'
    };
    var agentId = ALLOWED[surface];
    if (!agentId) {
      return Promise.resolve({ error: 'unknown_legacy_surface', surface: surface });
    }
    var self = this;
    return withRegistryLock(async function() {
      if (self._agents.has(agentId)) {
        return { agentId: agentId, ownershipToken: null };
      }
      var record = {
        agentId: agentId,
        createdAt: Date.now(),
        tabIds: [],
        legacy: true
      };
      self._agents.set(agentId, record);
      self._tabsByAgent.set(agentId, new Set());
      await self._persist();
      return { agentId: agentId, ownershipToken: null };
    });
  };

  /**
   * Bind a tab to an agent. Tab gets a single owner; if the tab is already
   * owned, this call returns false (Phase 240 enforces displacement vs reject
   * semantics at the dispatch gate; Phase 237 was structural only). Returns
   * false on unknown agent or invalid tabId, no throw.
   *
   * Phase 240 D-04: bindTab now mints a fresh ownershipToken (UUID), reads
   * the tab's incognito flag and windowId via chrome.tabs.get (await-able
   * inside the registry mutex; NOT called from the dispatch gate), and
   * caches the metadata in self._tabMetadata. The return shape changes from
   * boolean true to { agentId, tabId, ownershipToken } on success; false on
   * failure is preserved (truthy-check callers continue to work).
   *
   * Phase 240 Open Q2 (per-agent windowId pin): the agent's record stamps
   * its first-bound tab's windowId. Subsequent binds in a different window
   * leave the pin unchanged (set-once invariant). The dispatch gate uses
   * getAgentWindowId to detect cross-window dispatch.
   *
   * Phase 241 D-01: optional 3rd argument `opts` carries flags for the
   * forced-pool routing path. `opts.forced === true` is stored on the per-tab
   * metadata so observability / audit can distinguish background-fired binds
   * (chrome.tabs.onCreated forced-pool) from explicit tool-triggered binds.
   * Plan 02 wires the call site; the registry simply records the flag.
   *
   * @returns Promise<{agentId, tabId, ownershipToken} | false>
   */
  AgentRegistry.prototype.bindTab = function(agentId, tabId, opts) {
    var self = this;
    var forced = !!(opts && opts.forced === true);
    return withRegistryLock(async function() {
      if (typeof agentId !== 'string' || !self._agents.has(agentId)) {
        return false;
      }
      if (!isPositiveInteger(tabId)) {
        return false;
      }
      if (self._heldTabDelegations.has(tabId)) {
        return false;
      }
      // If another agent already owns this tab, refuse silently. Phase 240
      // ships the dispatch-gate enforcement that decides displace-vs-reject.
      var currentOwner = self._tabOwners.get(tabId);
      if (currentOwner && currentOwner !== agentId) {
        return false;
      }

      // Phase 240 D-04: read incognito + windowId once at bind time. Wrapped
      // in try/catch (Pitfall 1): if chrome.tabs.get throws or chrome.tabs is
      // missing, we default both fields to safe values and proceed -- the
      // gate's incognito branch will not trip on the false-default, but the
      // dispatch gate continues to enforce ownershipToken match.
      var incognitoFlag = false;
      var winId = null;
      var c = _getChrome();
      if (c && c.tabs && typeof c.tabs.get === 'function') {
        try {
          var tabInfo = await c.tabs.get(tabId);
          incognitoFlag = !!(tabInfo && tabInfo.incognito === true);
          if (tabInfo && Number.isFinite(tabInfo.windowId)) {
            winId = tabInfo.windowId;
          }
        } catch (_e) {
          // Tab may have closed between caller's intent and our get; bind
          // still proceeds with safe defaults. Subsequent dispatch through
          // Plan 02's gate handles staleness via isOwnedBy=false.
        }
      }

      // Phase 240 D-04: mint a fresh per-bindTab ownershipToken.
      var token = mintOwnershipToken();

      self._tabOwners.set(tabId, agentId);
      var ownedTabs = self._tabsByAgent.get(agentId);
      if (!ownedTabs) {
        ownedTabs = new Set();
        self._tabsByAgent.set(agentId, ownedTabs);
      }
      ownedTabs.add(tabId);
      var record = self._agents.get(agentId);
      if (record) {
        record.tabIds = Array.from(ownedTabs);
        record.selectedTabId = tabId;
        // Phase 240 Open Q2: per-agent window pinning. Set ONCE on first
        // bindTab; never overwritten. Dispatch gate consumes via
        // getAgentWindowId for cross-window detection.
        if (!Number.isFinite(record.windowId) && Number.isFinite(winId)) {
          record.windowId = winId;
        }
      }
      // Phase 240 D-04: cache per-tab metadata for the gate's sync read path.
      // Phase 241 D-01: stamp `forced` so observability can distinguish
      // chrome.tabs.onCreated openerTabId-routed binds from explicit ones.
      self._tabMetadata.set(tabId, {
        ownershipToken: token,
        incognito: incognitoFlag,
        windowId: winId,
        boundAt: Date.now(),
        forced: forced
      });

      await self._persist();
      return {
        agentId: agentId,
        tabId: tabId,
        ownershipToken: token
      };
    });
  };

  /**
   * Release a tab binding. IDEMPOTENT: a no-op for never-owned or already-
   * released tabs (Pitfall 6). Returns true if a binding was removed,
   * false otherwise. Never throws.
   *
   * Phase 237 does NOT release the agent when its last tab is released --
   * that lifecycle decision belongs to Phase 241 (reconnect grace).
   *
   * @returns Promise<boolean>
   */
  AgentRegistry.prototype.releaseTab = function(tabId) {
    var self = this;
    return withRegistryLock(async function() {
      if (self._heldTabDelegations.has(tabId) || !self._tabOwners.has(tabId)) {
        // No-op path: do NOT persist. Idempotency guarantee.
        return false;
      }
      var agentId = self._tabOwners.get(tabId);
      self._tabOwners.delete(tabId);
      // Phase 240 Pitfall 2: wipe per-tab metadata at release. A subsequent
      // bindTab on the same tabId mints a fresh ownershipToken; queued
      // requests carrying the OLD token fail isOwnedBy as the desired TOCTOU
      // defense.
      self._tabMetadata.delete(tabId);
      var ownedTabs = self._tabsByAgent.get(agentId);
      if (ownedTabs) {
        ownedTabs.delete(tabId);
        var record = self._agents.get(agentId);
        if (record) {
          record.tabIds = Array.from(ownedTabs);
          if (record.selectedTabId === tabId) {
            var nextSelected = ownedTabs.values().next();
            if (nextSelected && nextSelected.done === false && Number.isFinite(nextSelected.value)) {
              record.selectedTabId = nextSelected.value;
            } else {
              delete record.selectedTabId;
            }
          }
        }
        // Phase 241 D-10 / POOL-04: when the pool drains to zero, release the
        // agent record itself. Inlined (cannot call releaseAgent from inside
        // the mutex -- would re-enter the promise chain and deadlock per
        // RESEARCH Pattern 4 anti-pattern).
        if (ownedTabs.size === 0) {
          self._tabsByAgent.delete(agentId);
          self._agents.delete(agentId);
          self._removeDelegationForAgent(agentId);
        }
      }
      await self._persist();
      return true;
    });
  };

  /**
   * Synchronous read: is this tab owned by this agent?
   * Read-only path; no mutex needed.
   *
   * Phase 240 D-04: optional 3rd argument ownershipToken. When provided, the
   * stored token at _tabMetadata.get(tabId).ownershipToken MUST also match.
   * When omitted (undefined), the back-compat Phase 237 contract holds: the
   * (tabId, agentId) pair alone determines ownership. The dispatch gate
   * ALWAYS passes a token; legacy callers that have not been audited yet
   * keep working via the back-compat path.
   */
  AgentRegistry.prototype.isOwnedBy = function(tabId, agentId, ownershipToken) {
    if (this._tabOwners.get(tabId) !== agentId) return false;
    if (ownershipToken === undefined) return true;
    var meta = this._tabMetadata.get(tabId);
    if (!meta) return false;
    return meta.ownershipToken === ownershipToken;
  };

  /**
   * Synchronous read: who owns this tab? Returns the full agentId or null.
   */
  AgentRegistry.prototype.getOwner = function(tabId) {
    var owner = this._tabOwners.get(tabId);
    return owner || null;
  };

  /**
   * Phase 241 D-01: Synchronous reverse lookup -- given a tabId, return its
   * owning agentId or null. Used by background.js chrome.tabs.onCreated for
   * forced-pool routing (Plan 02). Wraps the existing _tabOwners reverse map;
   * no mutex needed (read-only path).
   */
  AgentRegistry.prototype.findAgentByTabId = function(tabId) {
    if (typeof tabId !== 'number' || !Number.isFinite(tabId)) return null;
    return this._tabOwners.get(tabId) || null;
  };

  /**
   * Phase 241 D-08-prep: stamp a per-bridge-connect connectionId onto an
   * existing agent record. Carrier for Plan 02's bridge wiring -- the bridge
   * mints a UUID at onopen and threads it into agent:register; the dispatcher
   * forwards that to here. stageReleaseByConnectionId then iterates _agents
   * and snapshots agentIds whose record.connectionId matches.
   *
   * Sync write -- no mutex needed (single-property mutation on an already-
   * existing record). Persist is fire-and-forget so the call site stays sync;
   * the persistence is for SW-eviction recovery only (the dispatch path does
   * NOT depend on connectionId being on disk to function).
   *
   * Returns true on success, false if agentId is unknown or args are not strings.
   */
  AgentRegistry.prototype.stampConnectionId = function(agentId, connectionId) {
    if (typeof agentId !== 'string' || typeof connectionId !== 'string') return false;
    var record = this._agents.get(agentId);
    if (!record) return false;
    record.connectionId = connectionId;
    // Best-effort persist; never throw. The mutator is sync from the caller's
    // perspective so the bridge does not need to await it.
    try {
      var p = this._persist();
      if (p && typeof p.catch === 'function') {
        p.catch(function() { /* best-effort */ });
      }
    } catch (_e) { /* swallow */ }
    return true;
  };

  /**
   * Stamp sanitized MCP initialize identity onto an existing live record.
   * clientInfo is descriptive evidence only; ownership and authorization
   * continue to depend exclusively on the minted agent id and tab token.
   */
  AgentRegistry.prototype.stampClientInfo = function(agentId, clientInfo) {
    if (typeof agentId !== 'string' || !isPlainObject(clientInfo)) return false;
    var next = {};
    if (typeof clientInfo.name === 'string') next.name = clientInfo.name;
    if (typeof clientInfo.version === 'string') next.version = clientInfo.version;
    if (Object.keys(next).length === 0) return false;
    var record = this._agents.get(agentId);
    if (!record) return false;
    record.clientInfo = next;
    try {
      var p = this._persist();
      if (p && typeof p.catch === 'function') {
        p.catch(function() { /* best-effort */ });
      }
    } catch (_e) { /* swallow */ }
    return true;
  };

  /**
   * Phase 241 D-08: Stage a deferred release for ALL agents currently stamped
   * with the given connectionId. Uses setTimeout (the Chrome alarms API
   * minimum is 30s, below the 10s default grace window). Persists the deadline +
   * agentIds snapshot to chrome.storage.session under the registry envelope's
   * stagedReleases sibling block, so SW eviction during the grace window does
   * not strand agents -- hydrate-time recovery (Pitfall 1) re-fires or
   * reschedules based on the persisted deadline.
   *
   * The agentIds snapshot is captured AT STAGE TIME (Q2 resolution): a fresh
   * agent claimed under a different connection_id between stage and expiry is
   * NOT swept up by an older grace timer.
   *
   * Returns true if at least one matching agent was found and a timer
   * scheduled; false on unknown / empty match.
   *
   * @param {string} connectionId
   * @param {number} [graceMs] -- defaults to RECONNECT_GRACE_MS (10s)
   * @returns Promise<boolean>
   */
  AgentRegistry.prototype.stageReleaseByConnectionId = function(connectionId, graceMs) {
    var self = this;
    return withRegistryLock(async function() {
      if (typeof connectionId !== 'string' || !connectionId) return false;
      var ms = (typeof graceMs === 'number' && Number.isFinite(graceMs) && graceMs > 0)
        ? graceMs
        : RECONNECT_GRACE_MS;
      var agentIds = [];
      self._agents.forEach(function(record, agentId) {
        if (record && record.connectionId === connectionId) agentIds.push(agentId);
      });
      if (agentIds.length === 0) return false;
      // Phase 241 WR-01: Clear any prior timer for this connectionId so we
      // don't leak it. Without this, a duplicated onclose / replay path that
      // re-stages without an intervening cancelStagedRelease would orphan
      // the previous timeoutId; that orphan eventually fires and releases
      // the replacement entry's snapshot prematurely.
      var prior = self._stagedReleases.get(connectionId);
      if (prior && prior.timeoutId) {
        try { clearTimeout(prior.timeoutId); } catch (_e) { /* swallow */ }
      }
      var deadline = Date.now() + ms;
      var timeoutId = setTimeout(function() {
        self._fireStagedRelease(connectionId).catch(function() { /* best-effort */ });
      }, ms);
      // setTimeout returns a Timer object in Node (with unref) and a number in
      // browsers. unref keeps long-grace test harnesses from hanging the
      // process when the test cancels but Node still sees a pending timer.
      if (timeoutId && typeof timeoutId.unref === 'function') {
        try { timeoutId.unref(); } catch (_e) { /* swallow */ }
      }
      self._stagedReleases.set(connectionId, {
        deadline: deadline,
        timeoutId: timeoutId,
        agentIds: agentIds.slice()
      });
      await self._persist();
      return true;
    });
  };

  /**
   * Phase 241 D-08: Cancel a staged release. Called from the bridge's onopen
   * when the same connectionId reconnects within the grace window. Clears
   * the in-memory timer and persisted entry. Idempotent: returns false if no
   * staged entry exists for this connectionId.
   *
   * @param {string} connectionId
   * @returns Promise<boolean>
   */
  AgentRegistry.prototype.cancelStagedRelease = function(connectionId) {
    var self = this;
    return withRegistryLock(async function() {
      if (typeof connectionId !== 'string') return false;
      var staged = self._stagedReleases.get(connectionId);
      if (!staged) return false;
      if (staged.timeoutId) {
        try { clearTimeout(staged.timeoutId); } catch (_e) { /* swallow */ }
      }
      self._stagedReleases.delete(connectionId);
      await self._persist();
      return true;
    });
  };

  /**
   * Phase 241 D-09: Fire a staged release. Called by setTimeout at expiry AND
   * by hydrate-time recovery when a persisted deadline has already passed.
   *
   * CRITICAL: Inlines the releaseAgent steps (clears _tabOwners, _tabMetadata,
   * _tabsByAgent, _agents). Does NOT call releaseAgent -- that would re-enter
   * withRegistryLock and deadlock the promise chain (RESEARCH Pattern 4 anti-
   * pattern).
   *
   * Pitfall 3: snapshot agentIds may include records that are no longer
   * present (e.g., explicitly released between stage and expiry, or never
   * rehydrated after SW eviction); skip those silently. Also defensive
   * against an agent whose connectionId was re-stamped under a fresh bridge
   * connection -- only releases agents whose CURRENT connectionId still
   * matches.
   *
   * Emits one rate-limited LOG-04 'agent-grace-expired' per released agent.
   *
   * @param {string} connectionId
   * @returns Promise<boolean>
   */
  AgentRegistry.prototype._fireStagedRelease = function(connectionId) {
    var self = this;
    return withRegistryLock(async function() {
      var staged = self._stagedReleases.get(connectionId);
      if (!staged) return false;
      var agentIds = Array.isArray(staged.agentIds) ? staged.agentIds : [];
      var releasedAny = false;
      agentIds.forEach(function(agentId) {
        var record = self._agents.get(agentId);
        // Pitfall 3: skip agents already gone, or agents whose connectionId
        // has been re-stamped (a fresh bridge took over before the timer
        // fired). The current-connection-id filter is the safety net.
        if (!record) return;
        if (record.connectionId !== connectionId) return;
        var mappedDelegation = self._delegationByAgent.get(agentId);
        if (mappedDelegation && self._holdLeases.has(mappedDelegation)) return;
        var ownedTabs = self._tabsByAgent.get(agentId);
        var poolSize = ownedTabs ? ownedTabs.size : 0;
        if (ownedTabs) {
          ownedTabs.forEach(function(tabId) {
            if (self._tabOwners.get(tabId) === agentId) {
              self._tabOwners.delete(tabId);
              self._tabMetadata.delete(tabId);
            }
          });
        }
        self._tabsByAgent.delete(agentId);
        self._agents.delete(agentId);
        self._removeDelegationForAgent(agentId);
        releasedAny = true;
        try {
          if (typeof globalThis !== 'undefined'
              && globalThis.FsbTriggerLifecycle
              && typeof globalThis.FsbTriggerLifecycle.handleTriggerOwnerReleased === 'function') {
            var cleanup = globalThis.FsbTriggerLifecycle.handleTriggerOwnerReleased(agentId);
            if (cleanup && typeof cleanup.catch === 'function') {
              cleanup.catch(function() { /* best-effort */ });
            }
          }
        } catch (_cleanupError) { /* best-effort */ }
        // D-09: one LOG-04 event per released agent in the connection.
        try {
          if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
            globalThis.rateLimitedWarn(
              FSB_AGENT_LOG_PREFIX,
              FSB_AGENT_GRACE_EXPIRED_CATEGORY,
              'agent grace expired',
              { agentId: agentId, connectionId: connectionId, poolSize: poolSize }
            );
          }
        } catch (_e) { /* swallow */ }
      });
      self._stagedReleases.delete(connectionId);
      await self._persist();
      return releasedAny;
    });
  };

  /**
   * Phase 241 D-05: Synchronous read of the cached cap value (the in-memory
   * mirror of chrome.storage.local fsbAgentCap). Defense-in-depth: also
   * applies _clampCap on the read path so a poisoned cache (e.g., from a
   * malformed onChanged event) cannot leak an out-of-range cap to callers.
   */
  AgentRegistry.prototype.getCap = function() {
    return _clampCap(this._cachedCap);
  };

  /**
   * Phase 241 D-05 / D-06: Set the cap, clamping to [MIN, MAX]. Writes to
   * chrome.storage.local under fsbAgentCap (best-effort; storage failures do
   * not throw because the in-memory cache is still updated). When the new cap
   * is below the current active count, emits ONE LOG-04 event with category
   * 'agent-cap-lowered-grandfathered' carrying { previousCap, newCap,
   * activeAtChange } per Q3 resolution.
   *
   * Returns the clamped cap value applied.
   */
  AgentRegistry.prototype.setCap = function(value) {
    var clamped = _clampCap(value);
    var previousCap = _clampCap(this._cachedCap);
    var activeAtChange = this._agents.size;
    this._cachedCap = clamped;
    var c = _getChrome();
    if (c && c.storage && c.storage.local && typeof c.storage.local.set === 'function') {
      try {
        var payload = {};
        payload[FSB_AGENT_CAP_STORAGE_KEY] = clamped;
        var ret = c.storage.local.set(payload);
        if (ret && typeof ret.catch === 'function') {
          ret.catch(function() { /* best-effort */ });
        }
      } catch (_e) { /* best-effort */ }
    }
    // Q3: diagnostic-only emission when M > newCap. No eviction.
    if (clamped < activeAtChange) {
      try {
        if (typeof globalThis !== 'undefined' && typeof globalThis.rateLimitedWarn === 'function') {
          globalThis.rateLimitedWarn(
            FSB_AGENT_LOG_PREFIX,
            FSB_AGENT_CAP_LOWERED_CATEGORY,
            'agent cap lowered while agents active (grandfathered)',
            { previousCap: previousCap, newCap: clamped, activeAtChange: activeAtChange }
          );
        }
      } catch (_e) { /* swallow */ }
    }
    return clamped;
  };

  /**
   * Phase 241: Synchronous test convenience. True iff the registry can accept
   * one more agent under the current cap (active < cap). Read-only; not used
   * by registerAgent (which performs the same check inside the mutex).
   */
  AgentRegistry.prototype.canAcceptNewAgent = function() {
    return this._agents.size < this.getCap();
  };

  /**
   * Phase 241 D-05: Best-effort hydrate of the cached cap from
   * chrome.storage.local. Called from hydrate() before serving requests so
   * the SW wakes with the operator-configured cap (not the static default).
   * If fsbAgentCap is missing, seeds the cap from the RAM-based recommendation
   * helper and persists it. Errors are swallowed; the fallback 8 stands when
   * storage or memory detection is unavailable.
   */
  AgentRegistry.prototype._loadCapFromStorage = async function() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.local || typeof c.storage.local.get !== 'function') {
      this._cachedCap = await _resolveRecommendedCap();
      return;
    }
    try {
      var stored = await c.storage.local.get([FSB_AGENT_CAP_STORAGE_KEY]);
      var hasStoredCap = !!(stored && Object.prototype.hasOwnProperty.call(stored, FSB_AGENT_CAP_STORAGE_KEY));
      var raw = stored && stored[FSB_AGENT_CAP_STORAGE_KEY];
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        this._cachedCap = _clampCap(raw);
        return;
      }
      if (hasStoredCap) {
        return;
      }
      this._cachedCap = await _resolveRecommendedCap();
      if (typeof c.storage.local.set === 'function') {
        var payload = {};
        payload[FSB_AGENT_CAP_STORAGE_KEY] = this._cachedCap;
        await c.storage.local.set(payload);
      }
    } catch (_e) {
      try {
        this._cachedCap = await _resolveRecommendedCap();
      } catch (_inner) { /* keep fallback default */ }
    }
  };

  /**
   * Phase 241 D-05: Install a chrome.storage.onChanged listener so the SW's
   * in-memory cap cache is refreshed whenever any other extension context
   * (options page, popup, sidepanel) writes a new value. Read-only listener
   * (does NOT write back) so no cross-context loop is possible (Pitfall 4).
   * Best-effort; never throws if chrome.storage.onChanged is absent.
   *
   * Phase 243 WR-02 hardening: guarded by a module-scope flag so at most ONE
   * listener is attached per SW classloader lifetime. SW restarts construct
   * a fresh AgentRegistry; without the guard each wake would attach a new
   * listener on top of (potentially) any references Chrome retained, and
   * tests that build multiple registries in a single Node process would
   * register N listeners that all close over different `self` captures.
   * The latest registry's `self` is mirrored onto the closure so storage
   * events drive the live instance's cache.
   */
  AgentRegistry.prototype._subscribeToCapChanges = function() {
    var self = this;
    // Always update the latest-instance reference so storage events route to
    // the live registry even if a fresh registry replaces a prior one.
    _capListenerLiveSelf = self;
    if (_capListenerAttached) return;
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.onChanged ||
        typeof c.storage.onChanged.addListener !== 'function') {
      return;
    }
    try {
      c.storage.onChanged.addListener(function(changes, area) {
        if (area !== 'local') return;
        if (!changes || !changes[FSB_AGENT_CAP_STORAGE_KEY]) return;
        var next = changes[FSB_AGENT_CAP_STORAGE_KEY].newValue;
        if (typeof next !== 'number' || !Number.isFinite(next)) return;
        var live = _capListenerLiveSelf;
        if (live) live._cachedCap = _clampCap(next);
      });
      _capListenerAttached = true;
    } catch (_e) { /* swallow */ }
  };

  /**
   * Phase 240 D-04: Synchronous read of per-tab metadata. The dispatch gate
   * (Plan 02) consumes this for the same-microtask discipline -- no
   * chrome.tabs.get round-trip at dispatch time. Returns a SHALLOW CLONE so
   * the caller cannot mutate live registry state. Returns null if the tab
   * is not bound (or its metadata was wiped at releaseTab).
   *
   * Phase 243 D-03 (BG-04): also surfaces lastAgentNavigationAt so the
   * webNavigation.onCommitted listener can suppress agent-driven nav
   * (Phase 242 back transitionType auto_bookmark false-positive) within
   * 500ms of the stamp.
   *
   * @returns {{ownershipToken, incognito, windowId, boundAt, forced, lastAgentNavigationAt} | null}
   */
  AgentRegistry.prototype.getTabMetadata = function(tabId) {
    var meta = this._tabMetadata.get(tabId);
    if (!meta) return null;
    return {
      ownershipToken: meta.ownershipToken,
      incognito: meta.incognito,
      windowId: meta.windowId,
      boundAt: meta.boundAt,
      // Phase 241 D-01: forced flag surfaces to observability callers so
      // chrome.tabs.onCreated openerTabId-routed binds are auditable.
      forced: meta.forced === true,
      // Phase 243 D-03 (BG-04): per-tab agent-initiated nav timestamp used by
      // the webNavigation.onCommitted listener to suppress emissions within
      // a 500ms window after a programmatic chrome.tabs.update / goBack.
      lastAgentNavigationAt: typeof meta.lastAgentNavigationAt === 'number'
        ? meta.lastAgentNavigationAt
        : 0
    };
  };

  /**
   * Phase 243 D-03 (BG-04): Stamp Date.now() onto the per-tab metadata so
   * the webNavigation.onCommitted listener can suppress its
   * 'agent-tab-user-navigation' emission for navigations that the agent
   * itself initiated (the Phase 242 `back` route fires Chrome
   * transitionType `auto_bookmark`, indistinguishable from a user-clicked
   * bookmark; a tight suppression window past the stamp is treated as
   * agent-driven and suppressed).
   *
   * Single source of truth for the suppression window: the constant
   * AGENT_NAV_SUPPRESSION_MS is exported from
   * extension/utils/agent-nav-emission.js (currently 500ms). The boundary
   * is INCLUSIVE there (`now - stamp <= AGENT_NAV_SUPPRESSION_MS`
   * suppresses; strictly greater emits). Do NOT redeclare the value in
   * this file; consult agent-nav-emission.js for the authoritative number.
   *
   * Idempotent re-stamping: a second call simply moves the timestamp
   * forward.
   *
   * Phase 243 WR-04: bound-tab guard. If the tab has no metadata entry yet
   * (i.e. it has never been bound to an agent), the stamp is SILENTLY
   * SKIPPED rather than auto-creating a partial metadata bucket. An unbound
   * tab cannot be the target of an agent-driven navigation in normal flow,
   * and an auto-created bucket would surface partial metadata
   * (ownershipToken / incognito / windowId / boundAt all undefined) that
   * downstream consumers of getTabMetadata could mis-interpret. The
   * suppression contract is preserved: a tab without a metadata bucket
   * also has no `lastAgentNavigationAt`, so the BG-04 helper's elapsed
   * check (now - 0 > 500) cleanly emits as user-initiated.
   *
   * Sync write (no mutex). The persisted envelope is refreshed best-effort
   * via _persist() so SW eviction during the suppression window does not
   * lose the stamp; the registry mutex serializes the storage write
   * naturally because _persist is itself fire-and-forget here.
   *
   * Callers: any code path that invokes chrome.tabs.update({url}) or
   * chrome.tabs.goBack on an agent-owned tab MUST call this helper BEFORE
   * the chrome API call. Concrete sites:
   *   - extension/background.js handleStartAutomation smart-tab navigation
   *     (chrome.tabs.update({url})). Phase 243 plan 02 wires this.
   *   - extension/ws/mcp-tool-dispatcher.js handleNavigateRoute
   *     (chrome.tabs.update({url})). Owned by Phase 243 plan 01; verified
   *     during integration.
   *   - extension/ws/mcp-tool-dispatcher.js handleNavigationHistoryRoute
   *     (chrome.tabs.goBack / goForward / reload). Phase 243 plan 02 wires
   *     this.
   *   - extension/ws/mcp-tool-dispatcher.js handleBackRoute (Phase 242 back
   *     route, chrome.tabs.goBack). Phase 243 plan 02 wires this.
   *   - extension/ai/tool-executor.js navigate / go_back autopilot path.
   *     Phase 243 plan 02 wires this.
   * Note: switch_tab does NOT navigate (it only changes active state); no
   * stamp needed.
   */
  AgentRegistry.prototype.stampAgentNavigation = function(tabId) {
    var id = (typeof tabId === 'number') ? tabId : Number(tabId);
    if (!Number.isFinite(id)) return;
    // Phase 243 WR-04: bound-tab guard. Stamp only when a metadata bucket
    // already exists (created by bindTab); silently skip otherwise so we
    // never surface partial metadata.
    var meta = this._tabMetadata.get(id);
    if (!meta) return;
    meta.lastAgentNavigationAt = Date.now();
    // Best-effort persist; fire-and-forget so the caller stays sync.
    try {
      var p = this._persist();
      if (p && typeof p.catch === 'function') {
        p.catch(function() { /* best-effort */ });
      }
    } catch (_e) { /* swallow */ }
  };

  /**
   * Phase 240: synchronous existence check. Used by the dispatch gate to
   * validate that the requesting agentId is registered before consulting
   * tab ownership. Cheaper than listAgents().some(...) and avoids the
   * defensive-clone allocation.
   */
  AgentRegistry.prototype.hasAgent = function(agentId) {
    return typeof agentId === 'string' && this._agents.has(agentId);
  };

  /**
   * Phase 240 Open Q2: synchronous read of the agent's pinned windowId.
   * The pin is set ONCE on the agent's first bindTab and never overwritten.
   * The dispatch gate consumes this to detect cross-window dispatch under
   * D-05's TAB_OUT_OF_SCOPE { reason: 'cross_window' } branch. Returns null
   * if the agent has not yet bound any tab (or chrome.tabs.get failed at
   * the time of first bind so windowId is unknown).
   */
  AgentRegistry.prototype.getAgentWindowId = function(agentId) {
    var record = this._agents.get(agentId);
    if (!record) return null;
    return Number.isFinite(record.windowId) ? record.windowId : null;
  };

  /**
   * Synchronous read: which tabs does this agent own? Returns an array
   * (never the live Set) or null if the agent is unknown.
   */
  AgentRegistry.prototype.getAgentTabs = function(agentId) {
    var ownedTabs = this._tabsByAgent.get(agentId);
    if (!ownedTabs) return null;
    return Array.from(ownedTabs);
  };

  /**
   * Synchronous read: which tab is selected for this agent's implicit
   * no-tab_id calls? Returns null when the agent is unknown, owns no tabs, or
   * the persisted selected tab no longer belongs to the agent.
   */
  AgentRegistry.prototype.getSelectedTabId = function(agentId) {
    var record = this._agents.get(agentId);
    if (!record || !Number.isFinite(record.selectedTabId)) return null;
    var ownedTabs = this._tabsByAgent.get(agentId);
    if (!ownedTabs || !ownedTabs.has(record.selectedTabId)) return null;
    return record.selectedTabId;
  };

  /**
   * Synchronous read: list all agents. Returns shallow CLONES so callers
   * cannot mutate live records. Order is insertion order (Map semantics).
   */
  AgentRegistry.prototype.listAgents = function() {
    var out = [];
    this._agents.forEach(function(record) {
      var clone = cloneRecord(record);
      if (clone) out.push(clone);
    });
    return out;
  };

  /**
   * Hydrate the registry from chrome.storage.session and reconcile against
   * the live tab set. Idempotent (second call is a no-op). Gated by
   * withRegistryLock so concurrent registerAgent / bindTab / etc. calls
   * cannot interleave with the rebuild + reconcile pass.
   *
   * Steps (RESEARCH.md Pattern 4):
   *   1. Rebuild Maps from { v: 1, records: { ... } } envelope
   *   2. Query chrome.tabs.query({}) to build liveTabIds Set
   *   3. Drop records whose tabIds are not in the live set; if all of an
   *      agent's tabs are ghosts, drop the agent record too. Conservative
   *      posture if chrome.tabs.query throws: do NOT drop anything.
   *   4. Emit one rateLimitedWarn('AGT', 'agent-reaped-<reason>', ...) per
   *      drop with redactedContext { agentIdShort, tabId, reason }.
   *   5. If any records were reaped, write the reconciled snapshot back to
   *      storage so memory and disk stay in sync.
   */
  AgentRegistry.prototype.hydrate = function() {
    if (this._hydrated) return Promise.resolve();
    var self = this;
    return withRegistryLock(async function() {
      if (self._hydrated) return; // double-check after lock acquisition

      // Phase 241 D-05: load configurable cap from chrome.storage.local before
      // serving any registerAgent calls so the SW wakes with the operator-set
      // cap rather than the static default.
      await self._loadCapFromStorage();

      var payload = await readPersistedAgentRegistry();
      var records = (payload && payload.records && typeof payload.records === 'object')
        ? payload.records : {};

      // Step 1: rebuild Maps from persisted records.
      Object.keys(records).forEach(function(agentId) {
        var record = records[agentId];
        if (!record || typeof record !== 'object') return;
        var tabIds = Array.isArray(record.tabIds) ? record.tabIds.slice() : [];
        var rebuilt = {
          agentId: record.agentId || agentId,
          createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
          tabIds: tabIds.slice()
        };
        // Phase 240 Open Q2: restore the agent's pinned windowId (set-once)
        // across SW eviction so cross-window detection survives wake-up.
        if (Number.isFinite(record.windowId)) {
          rebuilt.windowId = record.windowId;
        }
        // Phase 240 D-02: preserve legacy flag for synthesized legacy:* rows.
        if (record.legacy === true) {
          rebuilt.legacy = true;
        }
        // Phase 241 D-08: restore stamped connectionId so hydrate-time
        // staged-release recovery can match agents on the persisted snapshot.
        if (typeof record.connectionId === 'string') {
          rebuilt.connectionId = record.connectionId;
        }
        if (isPlainObject(record.clientInfo)) {
          var restoredClientInfo = {};
          if (typeof record.clientInfo.name === 'string') restoredClientInfo.name = record.clientInfo.name;
          if (typeof record.clientInfo.version === 'string') restoredClientInfo.version = record.clientInfo.version;
          if (Object.keys(restoredClientInfo).length > 0) {
            rebuilt.clientInfo = restoredClientInfo;
          }
        }
        if (Number.isFinite(record.selectedTabId) && tabIds.indexOf(record.selectedTabId) !== -1) {
          rebuilt.selectedTabId = record.selectedTabId;
        }
        self._agents.set(agentId, rebuilt);
        self._tabsByAgent.set(agentId, new Set(tabIds));
        tabIds.forEach(function(tabId) { self._tabOwners.set(tabId, agentId); });
      });

      // Phase 61: restore only internally consistent one-to-one delegation
      // rows. Unknown agents, malformed ids, duplicate reverse mappings, and
      // record-key mismatches are omitted rather than guessed or repaired.
      var delegationStateChanged = false;
      var persistedDelegations = (payload && isPlainObject(payload.delegations))
        ? payload.delegations : {};
      if (payload && payload.delegations !== undefined && !isPlainObject(payload.delegations)) {
        delegationStateChanged = true;
      }
      Object.keys(persistedDelegations).forEach(function(delegationId) {
        var agentId = persistedDelegations[delegationId];
        var record = self._agents.get(agentId);
        if (!isDelegationId(delegationId)
          || typeof agentId !== 'string'
          || !record
          || record.agentId !== agentId
          || self._delegationByAgent.has(agentId)) {
          delegationStateChanged = true;
          return;
        }
        self._delegations.set(delegationId, agentId);
        self._delegationByAgent.set(agentId, delegationId);
      });

      // Phase 240 D-04: rebuild _tabMetadata from the envelope's tabMetadata
      // block (sibling to records). Phase 240 Pitfall 6: stale Phase 237
      // envelopes have no tabMetadata; those tabs fail isOwnedBy on next
      // dispatch (token-aware path) and naturally rebind on the next
      // bindTab call. Token-less back-compat callers continue to pass.
      var persistedTabMetadata = (payload && payload.tabMetadata && typeof payload.tabMetadata === 'object')
        ? payload.tabMetadata : {};
      Object.keys(persistedTabMetadata).forEach(function(tabIdKey) {
        var meta = persistedTabMetadata[tabIdKey];
        if (!meta || typeof meta !== 'object') return;
        var tabId = parseInt(tabIdKey, 10);
        if (!Number.isFinite(tabId)) return;
        // Only restore metadata for tabs whose ownership row also rebuilt;
        // orphaned metadata (e.g., a binding dropped by a prior reap) is
        // left out so getTabMetadata returns null consistently.
        if (!self._tabOwners.has(tabId)) return;
        self._tabMetadata.set(tabId, {
          ownershipToken: meta.ownershipToken,
          incognito: meta.incognito === true,
          windowId: Number.isFinite(meta.windowId) ? meta.windowId : null,
          boundAt: typeof meta.boundAt === 'number' ? meta.boundAt : Date.now(),
          // Phase 241 D-01: restore forced audit flag from the persisted block.
          forced: meta.forced === true
        });
      });

      // Phase 61: hydrate sealed leases without consulting active-tab UI
      // state. Expired leases remain sealed and cancellation-required; time
      // alone never makes a possibly-human-controlled tab claimable.
      var holdLeaseStateChanged = false;
      var persistedHoldLeases = (payload && isPlainObject(payload.holdLeases))
        ? payload.holdLeases : {};
      if (payload && payload.holdLeases !== undefined && !isPlainObject(payload.holdLeases)) {
        holdLeaseStateChanged = true;
      }
      Object.keys(persistedHoldLeases).forEach(function(delegationId) {
        var raw = persistedHoldLeases[delegationId];
        var tabs = raw && canonicalOwnedTabs(raw.ownedTabs);
        var valid = hasExactKeys(raw, [
          'v', 'delegationId', 'agentId', 'activeTabId', 'ownedTabs', 'issuedAt', 'expiresAt'
        ])
          && raw.v === FSB_HOLD_LEASE_VERSION
          && raw.delegationId === delegationId
          && isDelegationId(delegationId)
          && typeof raw.agentId === 'string'
          && self.getAgentForDelegation(delegationId) === raw.agentId
          && isPositiveInteger(raw.activeTabId)
          && tabs
          && tabs.some(function(tab) { return tab.tabId === raw.activeTabId; })
          && Number.isSafeInteger(raw.issuedAt)
          && Number.isSafeInteger(raw.expiresAt)
          && raw.expiresAt === raw.issuedAt + FSB_HOLD_LEASE_MS;
        if (valid) {
          valid = tabs.every(function(tab) {
            return !self._tabOwners.has(tab.tabId) && !self._heldTabDelegations.has(tab.tabId);
          });
        }
        if (!valid) {
          holdLeaseStateChanged = true;
          return;
        }
        var lease = {
          v: FSB_HOLD_LEASE_VERSION,
          delegationId: delegationId,
          agentId: raw.agentId,
          activeTabId: raw.activeTabId,
          ownedTabs: tabs,
          issuedAt: raw.issuedAt,
          expiresAt: raw.expiresAt
        };
        self._holdLeases.set(delegationId, lease);
        tabs.forEach(function(tab) {
          self._heldTabDelegations.set(tab.tabId, delegationId);
        });
      });

      // Phase 241 Pitfall 1 -- recover staged releases before any early return
      // from the chrome.tabs unavailability paths below. Recovery does not
      // require chrome.tabs.query.
      self._recoverStagedReleasesFromPayload(payload);

      // Step 2: query live tabs. If chrome.tabs.query is unavailable or throws,
      // be conservative: keep everything (do not reap).
      var c = _getChrome();
      if (!c || !c.tabs || typeof c.tabs.query !== 'function') {
        self._hydrated = true;
        return;
      }
      var liveTabs;
      try {
        liveTabs = await c.tabs.query({});
      } catch (_e) {
        self._hydrated = true;
        return;
      }
      var liveTabIds = new Set();
      (liveTabs || []).forEach(function(t) {
        if (t && typeof t.id === 'number') liveTabIds.add(t.id);
      });

      // Step 3: drop ghost records.
      var reapedThisWake = [];
      var tabOwnerSnapshot = Array.from(self._tabOwners.entries());
      tabOwnerSnapshot.forEach(function(entry) {
        var tabId = entry[0];
        var agentId = entry[1];
        if (!liveTabIds.has(tabId)) {
          reapedThisWake.push({ agentId: agentId, tabId: tabId, reason: 'tab_not_found' });
          self._tabOwners.delete(tabId);
          // Phase 240: ghost reap also wipes _tabMetadata so a future bindTab
          // on a recycled tabId mints fresh state and the dispatch gate sees
          // no stale token / window / incognito snapshot.
          self._tabMetadata.delete(tabId);
          var setRef = self._tabsByAgent.get(agentId);
          if (setRef) {
            setRef.delete(tabId);
            // If this was the agent's last tab, the entire record is a ghost.
            // Phase 241 owns the "agent legitimately has no tabs" lifecycle;
            // here on hydrate specifically, an agent with all-ghost tabs IS
            // itself a ghost.
            if (setRef.size === 0) {
              self._tabsByAgent.delete(agentId);
              self._agents.delete(agentId);
              if (self._removeDelegationForAgent(agentId)) delegationStateChanged = true;
            } else {
              var rec = self._agents.get(agentId);
              if (rec) {
                rec.tabIds = Array.from(setRef);
                if (rec.selectedTabId === tabId) {
                  delete rec.selectedTabId;
                }
              }
            }
          }
        }
      });

      // Step 4: emit one diagnostic event per reaped record (rate-limited).
      reapedThisWake.forEach(function(reap) {
        emitAgentReapedEvent(reap.agentId, reap.tabId, reap.reason);
      });

      // Step 5: write reconciled snapshot back if anything changed.
      if (reapedThisWake.length > 0 || delegationStateChanged || holdLeaseStateChanged) {
        await self._persist();
      }

      self._hydrated = true;
    });
  };

  /**
   * Phase 241 Pitfall 1: hydrate-time recovery for staged releases.
   *
   * setTimeout dies on SW eviction; the Chrome alarms API cannot fill the
   * gap (30s floor vs 10s default grace). The persisted stagedReleases envelope is
   * the recovery mechanism: at hydrate time, scan the block and either fire
   * immediately (deadline passed during eviction) or schedule a fresh
   * setTimeout for the remaining time. The persisted timeoutId is
   * intentionally NOT carried across (Q2); a fresh DOM timer is always
   * allocated post-wake.
   *
   * Called from inside hydrate's withRegistryLock turn. Cannot call
   * _fireStagedRelease synchronously here -- it re-enters the same lock and
   * deadlocks the promise chain. The "deadline passed" branch defers the
   * fire to a 0ms setTimeout so it runs AFTER the hydrate lock releases.
   */
  AgentRegistry.prototype._recoverStagedReleasesFromPayload = function(payload) {
    var self = this;
    var persistedStaged = (payload && payload.stagedReleases && typeof payload.stagedReleases === 'object')
      ? payload.stagedReleases : {};
    var nowMs = Date.now();
    Object.keys(persistedStaged).forEach(function(connId) {
      var entry = persistedStaged[connId];
      if (!entry || typeof entry.deadline !== 'number') return;
      var snapshot = Array.isArray(entry.agentIds) ? entry.agentIds.slice() : [];
      if (entry.deadline <= nowMs) {
        // Re-stored on the in-memory map so the deferred fire can locate it
        // (the fire path reads deadline + agentIds via this map's entry).
        self._stagedReleases.set(connId, {
          deadline: entry.deadline,
          timeoutId: null,
          agentIds: snapshot
        });
        var t = setTimeout(function() {
          self._fireStagedRelease(connId).catch(function() { /* best-effort */ });
        }, 0);
        if (t && typeof t.unref === 'function') {
          try { t.unref(); } catch (_e) { /* swallow */ }
        }
      } else {
        var remaining = entry.deadline - nowMs;
        var timeoutId = setTimeout(function() {
          self._fireStagedRelease(connId).catch(function() { /* best-effort */ });
        }, remaining);
        if (timeoutId && typeof timeoutId.unref === 'function') {
          try { timeoutId.unref(); } catch (_e) { /* swallow */ }
        }
        self._stagedReleases.set(connId, {
          deadline: entry.deadline,
          timeoutId: timeoutId,
          agentIds: snapshot
        });
      }
    });
  };

  /**
   * Write-through helper. Serializes the live in-memory Maps into a plain
   * object keyed by agentId and writes the { v: 1, records } envelope to
   * chrome.storage.session under FSB_AGENT_REGISTRY_STORAGE_KEY. When the
   * registry is empty, writePersistedAgentRegistry removes the key entirely
   * (no stale envelope).
   *
   * Called from inside withRegistryLock by registerAgent / bindTab /
   * releaseTab / releaseAgent and from hydrate Step 5.
   */
  AgentRegistry.prototype._persist = async function(strict) {
    var records = {};
    var self = this;
    this._agents.forEach(function(record, agentId) {
      var tabSet = self._tabsByAgent.get(agentId);
      var stored = {
        agentId: record.agentId,
        createdAt: record.createdAt,
        tabIds: tabSet ? Array.from(tabSet) : []
      };
      // Phase 240 Open Q2: per-agent windowId pin survives the round-trip
      // so the dispatch gate's cross-window check holds across SW eviction.
      if (Number.isFinite(record.windowId)) {
        stored.windowId = record.windowId;
      }
      // Phase 240 D-02: legacy flag survives so listAgents callers can
      // distinguish synthesized legacy:* records from fresh-minted ones.
      if (record.legacy === true) {
        stored.legacy = true;
      }
      // Phase 241 D-08: connectionId stamped on the agent record (for grace
      // staging by connectionId on disconnect). Persisted so the hydrate-time
      // recovery path can match staged releases against rehydrated agents.
      if (typeof record.connectionId === 'string') {
        stored.connectionId = record.connectionId;
      }
      if (isPlainObject(record.clientInfo)) {
        var storedClientInfo = {};
        if (typeof record.clientInfo.name === 'string') storedClientInfo.name = record.clientInfo.name;
        if (typeof record.clientInfo.version === 'string') storedClientInfo.version = record.clientInfo.version;
        if (Object.keys(storedClientInfo).length > 0) {
          stored.clientInfo = storedClientInfo;
        }
      }
      if (Number.isFinite(record.selectedTabId) && tabSet && tabSet.has(record.selectedTabId)) {
        stored.selectedTabId = record.selectedTabId;
      }
      records[agentId] = stored;
    });

    // Phase 240 D-04: per-tab metadata block. Top-level (sibling to records)
    // because metadata is keyed by tabId not agentId. Hydrate rebuilds
    // _tabMetadata from this block; missing block is treated as empty for
    // graceful fall-through on stale Phase 237 envelopes (Pitfall 6).
    var tabMetadata = {};
    var hasTabMetadata = false;
    this._tabMetadata.forEach(function(meta, tabId) {
      tabMetadata[String(tabId)] = {
        ownershipToken: meta.ownershipToken,
        incognito: meta.incognito,
        windowId: meta.windowId,
        boundAt: meta.boundAt,
        // Phase 241 D-01: persist forced so the audit flag survives SW wake.
        forced: meta.forced === true
      };
      hasTabMetadata = true;
    });

    // Phase 241 Q2: stagedReleases block keyed by connectionId. timeoutId is
    // intentionally NOT persisted (DOM timer ids do not survive SW eviction).
    // The deadline + agentIds snapshot is enough for hydrate-time recovery
    // (Pattern 4: fire immediately if deadline passed, else schedule fresh
    // setTimeout for the remaining time).
    var stagedReleases = {};
    var hasStagedReleases = false;
    this._stagedReleases.forEach(function(entry, connId) {
      stagedReleases[connId] = {
        deadline: entry.deadline,
        agentIds: Array.isArray(entry.agentIds) ? entry.agentIds.slice() : []
      };
      hasStagedReleases = true;
    });

    // Phase 61: additive v1 delegation correlation map. Older readers ignore
    // the sibling field; newer readers validate both one-to-one indexes on
    // hydrate before accepting any row.
    var delegations = {};
    var hasDelegations = false;
    this._delegations.forEach(function(agentId, delegationId) {
      if (self._delegationByAgent.get(agentId) !== delegationId || !self._agents.has(agentId)) return;
      delegations[delegationId] = agentId;
      hasDelegations = true;
    });

    var holdLeases = {};
    var hasHoldLeases = false;
    this._holdLeases.forEach(function(lease, delegationId) {
      if (!lease
        || self._delegations.get(delegationId) !== lease.agentId
        || self._delegationByAgent.get(lease.agentId) !== delegationId) return;
      holdLeases[delegationId] = {
        v: lease.v,
        delegationId: lease.delegationId,
        agentId: lease.agentId,
        activeTabId: lease.activeTabId,
        ownedTabs: lease.ownedTabs.map(function(tab) {
          return { tabId: tab.tabId, ownershipToken: tab.ownershipToken };
        }),
        issuedAt: lease.issuedAt,
        expiresAt: lease.expiresAt
      };
      hasHoldLeases = true;
    });

    var extras = null;
    if (hasTabMetadata || hasStagedReleases || hasDelegations || hasHoldLeases) {
      extras = {};
      if (hasTabMetadata) extras.tabMetadata = tabMetadata;
      if (hasStagedReleases) extras.stagedReleases = stagedReleases;
      if (hasDelegations) extras.delegations = delegations;
      if (hasHoldLeases) extras.holdLeases = holdLeases;
    }
    await writePersistedAgentRegistry(records, extras, strict === true);
  };

  /**
   * Test-only hook. Clears all in-memory state. NOT called from production
   * code. Plan 03 integration adds a grep guard against accidental use.
   *
   * Note: the module-scope _registryChain self-heals via .catch(() => {}),
   * so resetting it here is unnecessary.
   */
  AgentRegistry.prototype._resetForTests = function() {
    this._agents.clear();
    this._tabOwners.clear();
    this._tabsByAgent.clear();
    // Phase 240: also clear the per-tab metadata cache.
    this._tabMetadata.clear();
    this._delegations.clear();
    this._delegationByAgent.clear();
    this._holdLeases.clear();
    this._heldTabDelegations.clear();
    // Phase 241: clear staged releases and any pending grace timers.
    if (this._stagedReleases) {
      this._stagedReleases.forEach(function(entry) {
        if (entry && entry.timeoutId) {
          try { clearTimeout(entry.timeoutId); } catch (_e) { /* swallow */ }
        }
      });
      this._stagedReleases.clear();
    }
    this._hydrated = false;
  };

  // ---- Export shape (mirrors mcp-visual-session.js:505-527) ---------------
  //
  // Both globalThis (for SW importScripts) AND module.exports (for Node test
  // harness). The module is loadable in either environment.

  var exportsObj = {
    AgentRegistry: AgentRegistry,
    formatAgentIdForDisplay: formatAgentIdForDisplay,
    withRegistryLock: withRegistryLock,
    FSB_AGENT_REGISTRY_STORAGE_KEY: FSB_AGENT_REGISTRY_STORAGE_KEY,
    FSB_AGENT_REGISTRY_PAYLOAD_VERSION: FSB_AGENT_REGISTRY_PAYLOAD_VERSION,
    FSB_AGENT_ID_PREFIX: FSB_AGENT_ID_PREFIX,
    FSB_AGENT_DISPLAY_HEX_LENGTH: FSB_AGENT_DISPLAY_HEX_LENGTH,
    FSB_AGENT_LOG_PREFIX: FSB_AGENT_LOG_PREFIX,
    FSB_HOLD_LEASE_MS: FSB_HOLD_LEASE_MS,
    FSB_AGENT_REAP_RATE_LIMIT_CATEGORY_BASE: FSB_AGENT_REAP_RATE_LIMIT_CATEGORY_BASE,
    // _internal: test-only hooks. NOT to be consumed by production callers.
    _internal: {
      emitAgentReapedEvent: emitAgentReapedEvent,
      resolveRecommendedCap: _resolveRecommendedCap,
      readPersistedAgentRegistry: readPersistedAgentRegistry,
      writePersistedAgentRegistry: writePersistedAgentRegistry
    }
  };

  global.FsbAgentRegistry = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
