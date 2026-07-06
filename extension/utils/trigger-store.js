(function(global) {
  'use strict';

  /**
   * Phase 14 plan 01 -- chrome.storage.session trigger-store helper.
   *
   * Owns the persisted lifecycle snapshot of armed `trigger` family watches.
   * Near byte-for-byte clone of extension/utils/mcp-task-store.js: same lazy
   * globalThis.chrome reference, same versioned envelope shape, same "empty
   * records map removes the storage key" discipline, same canonical-empty-on-
   * anything-wrong read posture, same best-effort no-throw posture. Only the
   * constants, the list-filter, the doc-comment schema, and the export/global
   * names change.
   *
   * SURV-01: trigger state must live OUTSIDE the MV3 service-worker heap so an
   * armed trigger survives SW eviction. readSnapshot always re-reads from
   * chrome.storage.session (never a captured in-memory reference), so a wake
   * after eviction returns persisted state. Per CONTEXT.md D-12 this uses
   * chrome.storage.session DIRECTLY (NOT the Lattice SurvivabilityAdapter);
   * survival is session-only -- a full Chrome quit ends watches (SURV-FUTURE-01).
   *
   * Storage shape (under chrome.storage.session, key `fsbTriggerRegistry`):
   *
   *   {
   *     v: 1,
   *     records: {
   *       [trigger_id]: {
   *         trigger_id,
   *         status,            // 'armed' | 'fired' | 'stopped' | 'error' | 'partial'
   *         watch,             // reserved (watch mechanism; consumed Phase 16/17)
   *         condition,         // reserved (fire condition; populated/evaluated Phase 15)
   *         selector,          // reserved (uniqueness-scored selector; Phase 15)
   *         target_tab_id,     // onRemoved reap key (LIFE-05 tab-close path)
   *         agent_id,          // stored faithfully (V4); Phase 18 enforces ownership -- do NOT normalize away
   *         baseline,          // reserved (initial_value; populated Phase 15)
   *         last_value,        // reserved (populated Phase 15)
   *         last_evaluated_at,
   *         armed_at,
   *         fired_at,
   *         deadline_at,       // = armed_at + FSB_TRIGGER_DEFAULT_TTL_MS (TTL reap key, LIFE-05)
   *         alarm_name         // 'fsbTrigger:<trigger_id>' (denormalized for orphan matching)
   *       }
   *     }
   *   }
   *
   * Per CONTEXT.md D-01 the snapshot stores flat scalars only. The store
   * WRITES/READS/REAPS these fields but interprets NONE of them: Phase 15+
   * populates and evaluates condition/selector/baseline/last_value -- this
   * module persists them verbatim.
   *
   * Best-effort posture (mirrors mcp-task-store.js): every storage call is
   * wrapped in try/catch; failure to persist must NEVER crash the SW or block
   * a resolve path.
   */

  // ---- Constants ----------------------------------------------------------

  var FSB_TRIGGER_REGISTRY_STORAGE_KEY = 'fsbTriggerRegistry';
  var FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION = 1;

  // ---- Storage helpers (mirror mcp-task-store.js:54-95) -------------------
  //
  // Lazy globalThis.chrome reference so the module loads cleanly under Node
  // test harnesses where chrome is mocked AFTER module load.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  /**
   * Read the persisted envelope. Returns the canonical empty envelope
   * `{ v: 1, records: {} }` when the storage key is missing, the version
   * does not match, or any error occurs -- never null, never a throw -- so
   * callers can skip null-checks before reading `envelope.records`.
   */
  async function _readEnvelope() {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session || typeof c.storage.session.get !== 'function') {
      return { v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, records: {} };
    }
    try {
      var stored = await c.storage.session.get([FSB_TRIGGER_REGISTRY_STORAGE_KEY]);
      var payload = stored ? stored[FSB_TRIGGER_REGISTRY_STORAGE_KEY] : null;
      if (!payload || typeof payload !== 'object') {
        return { v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      if (payload.v !== FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION) {
        return { v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      if (!payload.records || typeof payload.records !== 'object') {
        return { v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, records: {} };
      }
      return payload;
    } catch (_e) {
      return { v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION, records: {} };
    }
  }

  /**
   * Write the envelope. When the records map is empty, the storage key is
   * removed entirely (no stale envelope sitting in storage forever).
   */
  async function _writeEnvelope(envelope) {
    var c = _getChrome();
    if (!c || !c.storage || !c.storage.session) return;
    try {
      var nextRecords = (envelope && envelope.records && typeof envelope.records === 'object')
        ? envelope.records : {};
      if (Object.keys(nextRecords).length === 0) {
        if (typeof c.storage.session.remove === 'function') {
          await c.storage.session.remove(FSB_TRIGGER_REGISTRY_STORAGE_KEY);
        }
        return;
      }
      var toWrite = {};
      toWrite[FSB_TRIGGER_REGISTRY_STORAGE_KEY] = {
        v: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION,
        records: nextRecords
      };
      if (typeof c.storage.session.set === 'function') {
        await c.storage.session.set(toWrite);
      }
    } catch (_e) {
      // best-effort; do not throw
    }
  }

  // ---- Envelope RMW serialization -----------------------------------------
  //
  // Every full-envelope writer routes through this promise-chain mutex so two
  // concurrent snapshot writes on different triggerIds cannot race
  // (_readEnvelope -> mutate -> _writeEnvelope) and clobber each other's
  // status changes. Background dispatches two DOM-debounce triggerValueChanged
  // reports as parallel async IIFEs and each ends up calling writeSnapshot
  // through handleTriggerAlarm, so this race is real. Same shape as
  // learned-recipe-store.js _withLock. Reads stay unlocked -- MV3 is single
  // threaded per turn and the race is only between the read-mutate-write
  // sequences on the write path.
  var _envelopeChain = Promise.resolve();
  function _withEnvelopeLock(fn) {
    var run = _envelopeChain.then(fn, fn);
    _envelopeChain = run.catch(function() { /* swallow so a rejection does not poison the chain */ });
    return run;
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Write a snapshot under the given trigger_id. V5 input validation per ASVS:
   * silently no-op on bad inputs rather than throw.
   */
  async function writeSnapshot(triggerId, snapshot) {
    if (!triggerId || typeof triggerId !== 'string') return;
    if (!snapshot || typeof snapshot !== 'object') return;
    return _withEnvelopeLock(async function() {
      var envelope = await _readEnvelope();
      envelope.records[triggerId] = snapshot;
      await _writeEnvelope(envelope);
    });
  }

  /**
   * Read a snapshot by trigger_id. Returns null when unknown.
   */
  async function readSnapshot(triggerId) {
    if (!triggerId || typeof triggerId !== 'string') return null;
    var envelope = await _readEnvelope();
    return envelope.records[triggerId] || null;
  }

  /**
   * Delete a snapshot. Idempotent. When the records map becomes empty,
   * _writeEnvelope removes the storage key entirely.
   */
  async function deleteSnapshot(triggerId) {
    if (!triggerId || typeof triggerId !== 'string') return;
    return _withEnvelopeLock(async function() {
      var envelope = await _readEnvelope();
      if (!envelope.records[triggerId]) return;
      delete envelope.records[triggerId];
      await _writeEnvelope(envelope);
    });
  }

  /**
   * Return all snapshots whose status is currently 'armed'. Used by
   * trigger-lifecycle.js (Plan 14-02) reconcile to enumerate live triggers
   * that need to be re-armed after SW wake.
   */
  async function listArmedSnapshots() {
    var envelope = await _readEnvelope();
    return Object.keys(envelope.records)
      .map(function(k) { return envelope.records[k]; })
      .filter(function(s) { return s && s.status === 'armed'; });
  }

  /**
   * Return the canonical envelope shape so callers can enumerate records
   * without a second round-trip. Always returns `{ v: 1, records: {...} }`.
   */
  async function hydrate() {
    return await _readEnvelope();
  }

  // ---- Export shape (mirror mcp-task-store.js:179-194) --------------------

  var exportsObj = {
    writeSnapshot: writeSnapshot,
    readSnapshot: readSnapshot,
    deleteSnapshot: deleteSnapshot,
    listArmedSnapshots: listArmedSnapshots,
    hydrate: hydrate,
    FSB_TRIGGER_REGISTRY_STORAGE_KEY: FSB_TRIGGER_REGISTRY_STORAGE_KEY,
    FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION: FSB_TRIGGER_REGISTRY_PAYLOAD_VERSION
  };

  global.FsbTriggerStore = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
