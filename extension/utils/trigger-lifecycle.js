(function(global) {
  'use strict';

  /**
   * Phase 14 Plan 02 -- per-trigger chrome.alarms lifecycle for the `trigger`
   * family of reactive DOM watches.
   *
   * Clone of the alarm/restore/reap/handler SHAPE of
   * extension/utils/mcp-visual-session-lifecycle.js, with three deliberate
   * departures:
   *
   *   1. ALL overlay/visual-broadcast coupling is STRIPPED -- visual feedback
   *      (the analyzing pulse) is Phase 16, not Phase 14. There is zero overlay
   *      status-broadcast or session-shape-composition code here.
   *   2. Storage is the single versioned-envelope FsbTriggerStore (Plan 14-01),
   *      NOT a per-entity storage key. The lifecycle never holds trigger state in
   *      the SW heap: handleTriggerAlarm re-reads the snapshot from
   *      chrome.storage.session (via FsbTriggerStore.readSnapshot) on EVERY tick
   *      so an eviction between read and fire-decision cannot drop or duplicate a
   *      fire (SURV-02 / D-02 / D-09).
   *   3. restoreTriggersFromStorage adds the ONE genuinely-new piece: a
   *      chrome.alarms.getAll() orphan sweep (D-08) that clears any fsbTrigger:*
   *      alarm with no backing snapshot ("alarm into the void" is impossible).
   *
   * SURV-01: the only timer surface is chrome.alarms (no setInterval / keepalive).
   * The SW is NOT the survival mechanism: chrome.storage.session holds state and
   * chrome.alarms wakes the SW.
   *
   * LIFE-05: every trigger carries an absolute deadline_at = armed_at +
   * FSB_TRIGGER_DEFAULT_TTL_MS, reaped on three paths -- (a) an alarm tick where
   * now >= deadline_at; (b) restoreTriggersFromStorage dropping elapsed snapshots
   * on wake/restart; (c) handleTriggerTabRemoved when the target tab closes.
   *
   * SCOPE: this module ships the survivable alarm scaffold ONLY. The
   * evaluate-and-fire comparison operators (read element, compare, write 'fired')
   * are Phase 15 and plug into the marked seam in handleTriggerAlarm. There are
   * NO fire-condition operators, NO concurrency cap, NO MutationObserver, NO MCP
   * surface, and NO background.js edits in this module (INV-04: agent-loop.js is
   * untouched).
   *
   * Best-effort posture (cloned from both templates): every storage/alarm call is
   * wrapped so a failure never crashes the SW or blocks a resolve. Every public
   * entrypoint returns a typed { ok, ... } descriptor; the background.js glue
   * (Plan 14-03) also .catch-wraps every invocation.
   *
   * Dual-export IIFE: global.FsbTriggerLifecycle = exportsObj (SW importScripts
   * consumer, loaded AFTER trigger-store.js) + module.exports (Node test consumer).
   *
   * ASCII only. No emojis. No em-dashes between sentences (uses -- per project
   * conventions).
   */

  // ---- Constants ----------------------------------------------------------

  /**
   * chrome.alarms name prefix for the per-trigger wake clock (D-03).
   * Full name shape: 'fsbTrigger:<trigger_id>'. The background.js onAlarm
   * fan-out branches on alarm.name.startsWith(TRIGGER_ALARM_PREFIX).
   */
  var TRIGGER_ALARM_PREFIX = 'fsbTrigger:';

  /**
   * Default absolute trigger TTL, in milliseconds (D-11). Single named constant
   * (6h) -- replaces the visual template's MCP_VISUAL_LIFECYCLE_DEATH_MS = 60000.
   * Phase 19 may revise the detached-TTL / blocking-ceiling; keep it a single
   * constant so that reconciliation is a one-line change. Watches run for hours,
   * so a TTL shorter than a few hours would reap legitimate long watches.
   */
  var FSB_TRIGGER_DEFAULT_TTL_MS = 21600000; // 6h

  /**
   * Chrome MV3 production-build alarm minimum period/delay is 30 seconds
   * (periodInMinutes / delayInMinutes < 0.5 warns; `when` < 30s won't fire for
   * 30s). DECLARED here for Phase 17 (refresh-poll) to ENFORCE on the recurring
   * poll clock -- Phase 14 ships only one-shot { when: deadline_at } alarms and
   * does NOT enforce the floor. Exported both as ms and minutes for convenience.
   */
  var TRIGGER_ALARM_MIN_PERIOD_MS = 30000;
  var TRIGGER_ALARM_MIN_PERIOD_MINUTES = 0.5;

  // ---- Chrome / store resolvers (lazy, Node-mock seam) --------------------
  //
  // Resolve chrome and the trigger store at call time (not module-eval time) so
  // Node tests can inject a mock chrome + a freshly-required FsbTriggerStore
  // AFTER require()-ing this module. Mirrors the trigger-store.js _getChrome()
  // idiom for cross-module consistency.

  function _getChrome() {
    return (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
  }

  /**
   * Resolve the FsbTriggerStore (Plan 14-01). In the SW it is set on the global
   * by trigger-store.js's IIFE, which importScripts loads BEFORE this module. In
   * Node tests the store's IIFE assigns globalThis.FsbTriggerStore on require().
   * @returns {object|null}
   */
  function _getStore() {
    if (global && global.FsbTriggerStore && typeof global.FsbTriggerStore === 'object') {
      return global.FsbTriggerStore;
    }
    if (typeof globalThis !== 'undefined' && globalThis.FsbTriggerStore
        && typeof globalThis.FsbTriggerStore === 'object') {
      return globalThis.FsbTriggerStore;
    }
    return null;
  }

  // ---- Alarm helpers (best-effort no-throw, cloned from the template) ------
  //
  // The ONLY timer surface (no setInterval -- SURV-01 / Pitfall #3). Arm shape
  // is one-shot { when: deadline_at } (the recurring { periodInMinutes } clock is
  // Phase 17).

  /**
   * Best-effort no-throw wrapper around chrome.alarms.clear for a single name.
   * @param {string} name
   * @returns {Promise<boolean>} True on success (whether or not an alarm existed); false on error.
   */
  async function clearAlarm(name) {
    var c = _getChrome();
    if (!c || !c.alarms || typeof c.alarms.clear !== 'function') return false;
    try {
      await c.alarms.clear(name);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Best-effort no-throw wrapper around chrome.alarms.create.
   * @param {string} name
   * @param {object} alarmInfo Chrome alarmInfo object; we pass { when: deadline_at }.
   * @returns {Promise<boolean>} True on success; false on error.
   */
  async function createAlarm(name, alarmInfo) {
    var c = _getChrome();
    if (!c || !c.alarms || typeof c.alarms.create !== 'function') return false;
    try {
      await c.alarms.create(name, alarmInfo);
      return true;
    } catch (_error) {
      return false;
    }
  }

  // ---- Alarm-name composer ------------------------------------------------

  /**
   * Compose the per-trigger chrome.alarms name (D-03). Adapts the visual
   * template's finite-positive-INTEGER guard to a non-empty STRING id.
   * @param {string} triggerId
   * @returns {string|null} 'fsbTrigger:<triggerId>' on a non-empty string; null otherwise.
   */
  function alarmNameForTrigger(triggerId) {
    if (!triggerId || typeof triggerId !== 'string') return null;
    return TRIGGER_ALARM_PREFIX + triggerId;
  }

  // ---- Optional pure-plumbing helpers (RESEARCH Open Q1; ZERO fire logic) --

  /**
   * Arm a trigger: persist the snapshot then create its one-shot TTL/wake alarm
   * at the snapshot's deadline_at. Pure plumbing -- no fire-condition logic; the
   * snapshot must already be fully formed by the caller (Phase 15's
   * trigger-manager). Gives Phase 15 a clean seam without duplicating the
   * alarm-name composition or the { when } arm shape.
   *
   * @param {object} snapshot Trigger snapshot (must carry trigger_id + deadline_at).
   * @returns {Promise<{ok, reason?, armed?}>}
   */
  async function armTrigger(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, reason: 'invalid_snapshot' };
    }
    var triggerId = snapshot.trigger_id;
    var alarmName = alarmNameForTrigger(triggerId);
    if (!alarmName) {
      return { ok: false, reason: 'invalid_trigger_id' };
    }
    var store = _getStore();
    if (!store) {
      return { ok: false, reason: 'store_unavailable' };
    }
    await store.writeSnapshot(triggerId, snapshot);
    var deadlineAt = Number(snapshot.deadline_at);
    var armed = false;
    if (Number.isFinite(deadlineAt)) {
      armed = await createAlarm(alarmName, { when: deadlineAt });
    }
    return { ok: true, armed: armed };
  }

  /**
   * Clear a trigger: delete its snapshot and clear its alarm. Idempotent; no
   * broadcast, no reason-string ceremony (the visual template's clear path is
   * stripped of its overlay coupling here).
   * @param {string} triggerId
   * @returns {Promise<{ok, reason?, cleared?}>}
   */
  async function clearTrigger(triggerId) {
    if (!triggerId || typeof triggerId !== 'string') {
      return { ok: false, reason: 'invalid_trigger_id' };
    }
    var store = _getStore();
    if (store) {
      await store.deleteSnapshot(triggerId);
    }
    await clearAlarm(TRIGGER_ALARM_PREFIX + triggerId);
    return { ok: true, cleared: true };
  }

  // ---- Idempotent tick handler (SURV-02 / D-09) ---------------------------

  /**
   * Handle a chrome.alarms.onAlarm event for an fsbTrigger:<trigger_id> alarm.
   *
   * The survivable-evaluation harness (D-02): re-reads the persisted snapshot
   * from chrome.storage.session on EVERY tick (never the SW heap) and decides
   * against that persisted state, so an eviction between read and decision
   * cannot drop or duplicate a fire. Phase 14 ships only the idempotent
   * re-read/reap scaffold; the evaluate-and-fire comparison operators are
   * Phase 15 and plug into the marked seam below.
   *
   * Outcomes:
   *   - not_our_alarm        : alarm missing / name not an fsbTrigger:* name.
   *   - malformed_alarm_name : empty trigger id after the prefix.
   *   - noop_no_entry        : no backing snapshot (cleared via another path) (D-09).
   *   - noop_terminal        : snapshot already 'fired' or 'stopped' -- the
   *                            idempotent fire-guard against duplicate fire (D-09 / Pitfall #16).
   *   - reaped_ttl           : now >= deadline_at -> delete snapshot + clear alarm (LIFE-05 a).
   *   - evaluated_noop       : armed + not elapsed -> Phase 15 plugs evaluate-and-fire HERE.
   *
   * @param {{ name: string }} alarm Chrome alarm object.
   * @returns {Promise<object>} Typed outcome descriptor.
   */
  async function handleTriggerAlarm(alarm) {
    if (!alarm || typeof alarm !== 'object' || typeof alarm.name !== 'string') {
      return { ok: false, reason: 'not_our_alarm' };
    }
    if (alarm.name.indexOf(TRIGGER_ALARM_PREFIX) !== 0) {
      return { ok: false, reason: 'not_our_alarm' };
    }

    var triggerId = alarm.name.slice(TRIGGER_ALARM_PREFIX.length);
    if (!triggerId) {
      return { ok: false, reason: 'malformed_alarm_name' };
    }

    var store = _getStore();
    if (!store) {
      // Store not loaded -- cannot make a persisted decision; treat as a no-op
      // rather than throwing out of the SW glue.
      return { ok: true, action: 'noop_no_entry' };
    }

    // Re-read STORAGE every tick, never the SW heap (SURV-02 / D-02).
    var snap = await store.readSnapshot(triggerId);
    if (!snap) {
      return { ok: true, action: 'noop_no_entry' }; // D-09: cleared by another path
    }

    // Idempotent fire-guard: a terminal snapshot is never re-fired or re-reaped
    // (D-09 / Pitfall #16). Do NOT delete the entry or clear the alarm here --
    // the terminal transition's own clear path owns that.
    if (snap.status === 'fired' || snap.status === 'stopped') {
      return { ok: true, action: 'noop_terminal' };
    }

    var now = Date.now();

    // TTL reap path (a): an absolute deadline has elapsed (LIFE-05 / D-10a).
    // A non-finite deadline_at never satisfies this and falls through to
    // evaluated_noop without throwing (T-14-05 DoS mitigation).
    if (Number.isFinite(Number(snap.deadline_at)) && now >= Number(snap.deadline_at)) {
      await store.deleteSnapshot(triggerId);
      await clearAlarm(alarm.name);
      return { ok: true, action: 'reaped_ttl' };
    }

    // ----------------------------------------------------------------------
    // Phase 15 SEAM: plug the evaluate-and-fire step in HERE.
    //   - resolve the selector, extract the value, compare against the
    //     condition/baseline, and on a match write status:'fired' + fired_at
    //     back to storage ATOMICALLY before any delivery.
    // Phase 14 ships only the survivable re-read/re-arm scaffold. Do NOT add
    // comparison operators in this module.
    // ----------------------------------------------------------------------
    return { ok: true, action: 'evaluated_noop' };
  }

  // ---- Tab-close reap (LIFE-05 c / D-10c) ---------------------------------

  /**
   * Reap every trigger bound to a closed tab. KEY DIVERGENCE from the visual
   * template: the trigger store has no per-tab key, so this SCANS the records
   * map for every snapshot whose target_tab_id matches the closed tab (and only
   * those). Called from Plan 14-03's chrome.tabs.onRemoved listener.
   *
   * @param {number} tabId
   * @returns {Promise<{ok, reaped}>}
   */
  async function handleTriggerTabRemoved(tabId) {
    var numericTabId = Number(tabId);
    if (!Number.isFinite(numericTabId)) {
      return { ok: true, reaped: 0 };
    }
    var store = _getStore();
    if (!store) {
      return { ok: true, reaped: 0 };
    }
    var envelope = await store.hydrate();
    var records = (envelope && envelope.records && typeof envelope.records === 'object')
      ? envelope.records : {};
    var ids = Object.keys(records);
    var reaped = 0;
    for (var i = 0; i < ids.length; i++) {
      var snap = records[ids[i]];
      if (snap && Number(snap.target_tab_id) === numericTabId) {
        await store.deleteSnapshot(ids[i]);
        await clearAlarm(TRIGGER_ALARM_PREFIX + ids[i]);
        reaped++;
      }
    }
    return { ok: true, reaped: reaped };
  }

  // ---- SW-wake reconcile + orphan sweep (SURV-03 / D-08) ------------------

  /**
   * Reconcile the persisted trigger registry against the live alarm set on SW
   * cold boot. THE one genuinely-new piece versus the visual template: the
   * chrome.alarms.getAll() orphan sweep (D-08).
   *
   * For each persisted snapshot:
   *   - malformed (missing / non-object / non-finite deadline_at)
   *       -> deleteSnapshot + clearAlarm, dropped++.
   *   - terminal or expired (status !== 'armed' || now >= deadline_at)
   *       -> deleteSnapshot + clearAlarm, reaped++ (drop fired/stopped/expired).
   *   - else (armed + not elapsed)
   *       -> createAlarm({ when: deadline_at }) re-arming the ORIGINAL deadline,
   *          restored++ (SURV-03: deadline arithmetic does NOT silently reset).
   *
   * Then the orphan sweep: any live fsbTrigger:* alarm with NO backing snapshot
   * is cleared (orphans_cleared++) -- this kills "alarm into the void" after a
   * code reload. The sweep is scoped strictly to the TRIGGER_ALARM_PREFIX so
   * foreign alarms (mcpVisualDeath:*, telemetry, reconnect, watchdog) are never
   * touched.
   *
   * Called once at SW startup from the background.js bootstrap (Plan 14-03).
   *
   * @returns {Promise<{ok, restored, reaped, dropped, orphans_cleared}>}
   */
  async function restoreTriggersFromStorage() {
    var counters = { restored: 0, reaped: 0, dropped: 0, orphans_cleared: 0 };

    var store = _getStore();
    if (!store) {
      return Object.assign({ ok: true }, counters);
    }

    var envelope = await store.hydrate();
    var records = (envelope && envelope.records && typeof envelope.records === 'object')
      ? envelope.records : {};
    var now = Date.now();

    // Snapshot of the live alarm set for orphan detection (best-effort).
    var liveAlarmNames = [];
    var c = _getChrome();
    if (c && c.alarms && typeof c.alarms.getAll === 'function') {
      try {
        var alarms = await c.alarms.getAll();
        if (Array.isArray(alarms)) {
          for (var a = 0; a < alarms.length; a++) {
            if (alarms[a] && typeof alarms[a].name === 'string') {
              liveAlarmNames.push(alarms[a].name);
            }
          }
        }
      } catch (_e) {
        liveAlarmNames = [];
      }
    }

    // Track which alarm names a snapshot backs, so the orphan sweep can clear
    // the rest.
    var snapshotAlarmNames = {};
    var ids = Object.keys(records);
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var snap = records[id];
      var alarmName = TRIGGER_ALARM_PREFIX + id;
      snapshotAlarmNames[alarmName] = true;

      var malformed = !snap || typeof snap !== 'object' || !Number.isFinite(Number(snap.deadline_at));
      if (malformed) {
        await store.deleteSnapshot(id);
        await clearAlarm(alarmName);
        counters.dropped++;
        continue;
      }

      if (snap.status !== 'armed' || now >= Number(snap.deadline_at)) {
        // Drop fired/stopped/expired (delete entry + clear alarm).
        await store.deleteSnapshot(id);
        await clearAlarm(alarmName);
        counters.reaped++;
      } else {
        // Re-arm the survivor with its ORIGINAL deadline (idempotent create).
        await createAlarm(alarmName, { when: Number(snap.deadline_at) });
        counters.restored++;
      }
    }

    // Orphan sweep (D-08): clear any live fsbTrigger:* alarm with no snapshot.
    // Ordered awaits via a for loop (matching the template's style).
    for (var k = 0; k < liveAlarmNames.length; k++) {
      var name = liveAlarmNames[k];
      if (name.indexOf(TRIGGER_ALARM_PREFIX) === 0 && !snapshotAlarmNames[name]) {
        await clearAlarm(name);
        counters.orphans_cleared++;
      }
    }

    return Object.assign({ ok: true }, counters);
  }

  // ---- Module exports (dual-export IIFE) ----------------------------------

  var exportsObj = {
    TRIGGER_ALARM_PREFIX: TRIGGER_ALARM_PREFIX,
    FSB_TRIGGER_DEFAULT_TTL_MS: FSB_TRIGGER_DEFAULT_TTL_MS,
    TRIGGER_ALARM_MIN_PERIOD_MS: TRIGGER_ALARM_MIN_PERIOD_MS,
    TRIGGER_ALARM_MIN_PERIOD_MINUTES: TRIGGER_ALARM_MIN_PERIOD_MINUTES,
    alarmNameForTrigger: alarmNameForTrigger,
    armTrigger: armTrigger,
    clearTrigger: clearTrigger,
    handleTriggerAlarm: handleTriggerAlarm,
    handleTriggerTabRemoved: handleTriggerTabRemoved,
    restoreTriggersFromStorage: restoreTriggersFromStorage
  };

  global.FsbTriggerLifecycle = exportsObj;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
