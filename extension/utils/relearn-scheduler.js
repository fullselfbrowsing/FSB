(function(global) {
  'use strict';

  /**
   * Phase 43 plan 03 (v1.0.0 Catalog-Scale + Milestone Gate, SCALE-02) --
   * relearn-scheduler.js
   *
   * The per-origin re-learn COALESCING + exponential BACK-OFF scheduler. At 119-app
   * scale, one vendor changing site-wide rots N recipes on one origin; the shipped
   * capability-router.js _quarantineAndRelearn fires discovery.runDiscovery(origin,
   * { tabId }) FIRE-AND-FORGET on EVERY broken verdict -> N concurrent CDP attaches
   * (the thundering-herd). This scheduler is the debounce LAYER that re-learn flows
   * through: N scheduleRelearn calls for ONE origin within the coalescing window
   * collapse to ONE consent-gated re-learn fn invocation, with exponential back-off on
   * repeated failure.
   *
   * CONSENT-PRESERVING + FAIL-SAFE: the scheduler ONLY calls the supplied fn (the
   * caller passes the consent-gated runDiscovery bound to the origin) -- it never
   * re-implements capture or consent. The Phase-30 gate (_runGate inside
   * network-capture.startSession) still runs INSIDE fn. An fn that resolves ok:false
   * (e.g. RECIPE_CONSENT_*) is treated as a failed attempt for back-off, and the
   * scheduler captures NOTHING itself. A throw/rejection is swallowed into a failed
   * attempt (best-effort, never poisons the scheduler) -- mirroring the fire-and-forget
   * posture of capability-router.js _quarantineAndRelearn.
   *
   * BOUNDED: the tracked-origin map is capped (MAX_TRACKED_ORIGINS, mirroring the
   * learned-recipe-store PER_ORIGIN_CAP discipline -- the least-recently-touched origin
   * is evicted past the cap) and the back-off delay is capped at MAX_BACKOFF_MS. State
   * can never grow unbounded.
   *
   * NOT ON THE RECIPE PATH (Wall-1 by construction): this module is deliberately NOT
   * named capability-*.js -- it does not bind or execute a recipe, it only schedules a
   * consent-gated fn call -- so scripts/verify-recipe-path-guard.mjs Check 4 (which
   * globs capability-*.js and fails closed on any not-on-the-allowlist) does NOT require
   * an allowlist entry for it. It is kept dynamic-code-FREE anyway (ASCII-only, no
   * run-string-as-code / function-from-string / dynamic module-loader constructs even
   * in comments) to match the family discipline.
   *
   * TEST SEAM (so the back-off schedule is asserted SYNCHRONOUSLY, no setTimeout race):
   *   - opts.now: () => ms                -- the injectable monotonic clock (else Date.now).
   *   - opts.setTimer/opts.clearTimer     -- injectable timer hooks (else setTimeout/clearTimeout).
   *   - flush(origin?)                    -- runs the due re-learn for an origin (or all
   *                                          eligible origins when no arg) WITHOUT a
   *                                          wall-clock wait; returns a promise that
   *                                          resolves after the fn settles.
   *   - _reset()                          -- clears the tracked-origin map (test hook).
   *
   * Module shell: the dual-export IIFE mirror of learned-recipe-store.js. The SW reads
   * global.FsbRelearnScheduler after the worker imports the script; Node tests
   * require() module.exports.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Constants (exported so the test references the real schedule) --------
  // The coalescing window: N scheduleRelearn calls for one origin within this window
  // collapse to ONE fn invocation. Small + bounded.
  var COALESCE_WINDOW_MS = 2000;
  // Exponential back-off: base delay, doubled per failed attempt, capped at the ceiling.
  var BASE_BACKOFF_MS = 5000;
  var MAX_BACKOFF_MS = 300000; // 5 minutes -- a finite ceiling (never unbounded)
  // The tracked-origin cap (mirrors learned-recipe-store PER_ORIGIN_CAP=24 discipline):
  // past this many distinct tracked origins, the least-recently-touched is evicted.
  var MAX_TRACKED_ORIGINS = 64;

  // ---- per-origin scheduler state -------------------------------------------
  // Null-proto map (learned-recipe-store ME-03 idiom) so a __proto__ origin survives as
  // own data. Each record: { fn, pending, timer, attempt, nextEligibleAt, touchedAt }.
  //   - pending: there is a coalesced re-learn awaiting the window/flush.
  //   - attempt: consecutive failed-attempt count (drives the exponential back-off).
  //   - nextEligibleAt: ms before which a re-schedule is deferred (back-off window).
  //   - touchedAt: last scheduleRelearn time (for LRU eviction past the cap).
  var _origins = null;

  function _map() {
    if (!_origins) { _origins = Object.create(null); }
    return _origins;
  }

  // ---- injectable clock/timer accessors (opts seam, else platform defaults) --
  function _nowOf(opts) {
    return (opts && typeof opts.now === 'function') ? opts.now : Date.now;
  }
  function _setTimerOf(opts) {
    if (opts && typeof opts.setTimer === 'function') { return opts.setTimer; }
    return (typeof setTimeout === 'function') ? setTimeout : function() { return 0; };
  }
  function _clearTimerOf(opts) {
    if (opts && typeof opts.clearTimer === 'function') { return opts.clearTimer; }
    return (typeof clearTimeout === 'function') ? clearTimeout : function() {};
  }

  // ---- back-off delay for a given attempt count -----------------------------
  // attempt 0 -> 0 (no back-off, the origin is healthy); attempt 1 -> BASE; attempt 2 ->
  // 2*BASE; ... capped at MAX_BACKOFF_MS. Exponential, NOT constant.
  function _backoffFor(attempt) {
    if (!attempt || attempt < 1) { return 0; }
    var delay = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
    return delay > MAX_BACKOFF_MS ? MAX_BACKOFF_MS : delay;
  }

  // ---- LRU eviction past the tracked-origin cap -----------------------------
  // If the tracked-origin count EXCEEDS MAX_TRACKED_ORIGINS, evict the origin with the
  // oldest touchedAt (least-recently-touched). Never unbounded.
  function _evictIfOverCap(exceptOrigin) {
    var map = _map();
    var keys = Object.keys(map);
    if (keys.length <= MAX_TRACKED_ORIGINS) { return; }
    var oldestKey = null;
    var oldestAt = Infinity;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i] === exceptOrigin) { continue; } // never evict the just-touched origin
      var rec = map[keys[i]];
      var at = (rec && typeof rec.touchedAt === 'number') ? rec.touchedAt : 0;
      if (at < oldestAt) { oldestAt = at; oldestKey = keys[i]; }
    }
    if (oldestKey !== null) {
      var ev = map[oldestKey];
      if (ev && ev.timer != null && ev._clearTimer) {
        try { ev._clearTimer(ev.timer); } catch (_e) { /* best-effort */ }
      }
      delete map[oldestKey];
    }
  }

  // ---- _runOrigin(origin) -- run the coalesced re-learn for an origin -------
  // Best-effort + fail-safe: invokes rec.fn(origin), treats ok:false / throw / rejection
  // as a failed attempt (arms/grows back-off), ok:true as recovery (resets attempt).
  // Returns a promise that resolves after the fn settles (so flush can await it).
  function _runOrigin(origin) {
    var map = _map();
    var rec = map[origin];
    if (!rec || !rec.pending || typeof rec.fn !== 'function') {
      return Promise.resolve();
    }
    // Clear any armed timer + mark not-pending BEFORE invoking (so a re-entrant
    // scheduleRelearn during the fn coalesces into a fresh cycle, not this one).
    if (rec.timer != null && rec._clearTimer) {
      try { rec._clearTimer(rec.timer); } catch (_e) { /* best-effort */ }
    }
    rec.timer = null;
    rec.pending = false;
    var fn = rec.fn;
    var now = rec._now || Date.now;
    var settle = function(ok) {
      // Re-read the record (it may have been evicted/reset during the async fn).
      var cur = _map()[origin];
      if (!cur) { return; }
      if (ok === true) {
        cur.attempt = 0;             // recovered -> reset back-off
        cur.nextEligibleAt = 0;
      } else {
        cur.attempt = (typeof cur.attempt === 'number' ? cur.attempt : 0) + 1;
        cur.nextEligibleAt = now() + _backoffFor(cur.attempt);
      }
    };
    var p;
    try {
      p = Promise.resolve(fn(origin));
    } catch (_syncErr) {
      // a synchronous throw is a failed attempt (fail-safe, never poisons)
      settle(false);
      return Promise.resolve();
    }
    return p.then(function(result) {
      settle(result && result.ok === true);
    }, function() {
      // a rejection is a failed attempt for back-off
      settle(false);
    });
  }

  // ---- scheduleRelearn(origin, fn, opts) -- the entry point -----------------
  // COALESCING: N calls for one origin within the coalescing window collapse to ONE
  // pending fn invocation. BACK-OFF: a call arriving before nextEligibleAt is deferred
  // (re-armed for nextEligibleAt), not run immediately. Keyed by origin; distinct
  // origins are independent. Bounded by MAX_TRACKED_ORIGINS. The fn is the consent-gated
  // re-learn (runDiscovery bound to the origin) -- the scheduler never re-implements it.
  function scheduleRelearn(origin, fn, opts) {
    if (typeof origin !== 'string' || !origin || typeof fn !== 'function') {
      return; // fail-safe no-op on bad args
    }
    var now = _nowOf(opts);
    var setTimer = _setTimerOf(opts);
    var clearTimer = _clearTimerOf(opts);
    var map = _map();
    var rec = map[origin];
    if (!rec || typeof rec !== 'object') {
      rec = {
        fn: fn,
        pending: false,
        timer: null,
        attempt: 0,
        nextEligibleAt: 0,
        touchedAt: now(),
        _now: now,
        _setTimer: setTimer,
        _clearTimer: clearTimer
      };
      map[origin] = rec;
    } else {
      // refresh the fn + injected seams + touch time (the latest consent-gated fn wins)
      rec.fn = fn;
      rec._now = now;
      rec._setTimer = setTimer;
      rec._clearTimer = clearTimer;
      rec.touchedAt = now();
    }

    // Already a coalesced re-learn pending for this origin -> COALESCE (do NOT schedule
    // a second fn invocation; the N-th call collapses into the one already pending).
    if (rec.pending) {
      _evictIfOverCap(origin);
      return;
    }

    // Mark pending + arm the fire. The fire time respects the back-off window: if a
    // back-off is in effect (nextEligibleAt in the future), fire at nextEligibleAt;
    // otherwise after the coalescing window. flush() can run it earlier deterministically.
    rec.pending = true;
    var nowMs = now();
    var dueAt = (rec.nextEligibleAt && rec.nextEligibleAt > nowMs)
      ? rec.nextEligibleAt
      : (nowMs + COALESCE_WINDOW_MS);
    rec._dueAt = dueAt;
    var delay = dueAt - nowMs;
    if (delay < 0) { delay = 0; }
    // Arm the platform/injected timer (the test passes a no-op setTimer + drives flush()).
    try {
      rec.timer = setTimer(function() { _runOrigin(origin); }, delay);
    } catch (_e) {
      rec.timer = null; // best-effort; flush() is still the deterministic path
    }

    _evictIfOverCap(origin);
  }

  // ---- flush(origin?) -- deterministic run of the due re-learn --------------
  // Runs the coalesced re-learn for `origin` (or for ALL eligible origins when no arg)
  // WITHOUT a wall-clock wait, IF it is due: pending AND now >= nextEligibleAt (the
  // back-off window has elapsed). A pending re-learn still inside its back-off window is
  // NOT run (it stays deferred). Returns a promise resolving after the fn(s) settle.
  function flush(origin) {
    var map = _map();
    if (typeof origin === 'string' && origin) {
      var rec = map[origin];
      if (!rec || !rec.pending) { return Promise.resolve(); }
      var now = rec._now || Date.now;
      if (rec.nextEligibleAt && now() < rec.nextEligibleAt) {
        return Promise.resolve(); // still inside the back-off window -> deferred
      }
      return _runOrigin(origin);
    }
    // No arg: flush every eligible origin.
    var keys = Object.keys(map);
    var ps = [];
    for (var i = 0; i < keys.length; i++) {
      var r = map[keys[i]];
      if (!r || !r.pending) { continue; }
      var n = r._now || Date.now;
      if (r.nextEligibleAt && n() < r.nextEligibleAt) { continue; }
      ps.push(_runOrigin(keys[i]));
    }
    return Promise.all(ps);
  }

  // ---- trackedOriginCount() -- the bound assertion accessor -----------------
  function trackedOriginCount() {
    return _origins ? Object.keys(_origins).length : 0;
  }

  // ---- _reset() -- test hook ------------------------------------------------
  // Clears the tracked-origin map (mirrors the store's _reset). Best-effort clears any
  // armed timers so a fresh test starts with no pending fires.
  function _reset() {
    if (_origins) {
      var keys = Object.keys(_origins);
      for (var i = 0; i < keys.length; i++) {
        var rec = _origins[keys[i]];
        if (rec && rec.timer != null && rec._clearTimer) {
          try { rec._clearTimer(rec.timer); } catch (_e) { /* best-effort */ }
        }
      }
    }
    _origins = null;
  }

  // ---- Export shape (dual-export IIFE; mirror learned-recipe-store.js) -------
  var exportsObj = {
    COALESCE_WINDOW_MS: COALESCE_WINDOW_MS,
    BASE_BACKOFF_MS: BASE_BACKOFF_MS,
    MAX_BACKOFF_MS: MAX_BACKOFF_MS,
    MAX_TRACKED_ORIGINS: MAX_TRACKED_ORIGINS,
    scheduleRelearn: scheduleRelearn,
    flush: flush,
    trackedOriginCount: trackedOriginCount,
    _reset: _reset
  };

  global.FsbRelearnScheduler = exportsObj;   // the SW consumer reads this global at boot

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
