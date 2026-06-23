(function(global) {
  'use strict';

  /**
   * Phase 31 plan 06 (v0.9.99 -- DISC-01 / LEARN-01 / D-01 / D-10) -- discovery-session.js
   *
   * The orchestration glue for the user-initiated, time-boxed, consent-gated
   * discovery session (D-01). It is the thin SW-side coordinator that ties the
   * Phase-31 leaf modules together into ONE promote-after-replay loop -- it does
   * NOT re-architect any of them:
   *
   *   1. startSession via FsbNetworkCapture (the consent gate runs INSIDE
   *      startSession, BEFORE any debugger attach -- a default-OFF / denied /
   *      sensitive-unconfirmed origin returns a RECIPE_CONSENT_* reason and NOTHING
   *      is captured).
   *   2. await the session bound (the capture module ends itself on the time/count
   *      bound; endSession returns the redacted ObservedCall[]).
   *   3. for EACH redacted ObservedCall: synthesize a CANDIDATE via
   *      FsbRecipeSynthesizer.synthesize (closed-vocab recipe + descriptor, already
   *      validateRecipe-gated; a null synthesis is skipped/discarded).
   *   4. PROMOTE-AFTER-REPLAY (D-10): replay the candidate through the REAL
   *      interpretRecipe -> executeBoundSpec path threading the loader's
   *      { trustedProvenance: 'local' } vouch (HI-01 -- the recipe NEVER self-
   *      declares 'local'); promote to the per-origin learned store + feed the
   *      capability search index ONLY on a CLEAN replay (both success:true). A
   *      failed interpret OR a failed execute DISCARDS the candidate -- no
   *      speculative recipe ever reaches the store.
   *   5. return a summary { ok, promoted:[...slugs], discarded:N,
   *      flaggedForPhase32:[...slugs] } -- slugs/counts ONLY (no body, no args, no
   *      header values, no secrets).
   *
   * The replay shape MIRRORS capability-router.js _runDeclarativeTier
   * (interpretRecipe -> executeBoundSpec; fail-closed on a falsy/non-success
   * result) so the learned recipe replays through the SAME validate-bind-execute
   * path the T2 tier uses at runtime. The interpreter short-circuits to the
   * synchronous bind for a 'local' provenance exactly as it does for 'bundled'
   * (Plan 04), so the 'local' vouch is what makes the exempt bind fire -- never a
   * payload self-declaration.
   *
   * Module shell: the dual-export IIFE mirror of network-capture.js /
   * recipe-synthesizer.js. The service worker reads global.FsbDiscoverySession
   * after importScripts; Node tests require() the module.exports. Every collaborator
   * is reached through a typeof-guarded global accessor that degrades to null, so
   * the module loads cleanly under the Node test harness and a missing collaborator
   * never throws on the boot path.
   *
   * This module ORCHESTRATES -- it does not itself bind or execute a recipe string,
   * so it is NOT on RECIPE_PATH_ALLOWLIST (and it is not auto-globbed: the guard's
   * capability-* disk glob does not match this name). It is kept dynamic-code-FREE
   * regardless (no run-string-as-code / function-from-string / dynamic module loader
   * constructs, even in comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- typeof-guarded SW-global accessors (network-capture.js idiom) --------
  // Each degrades to null when the collaborator is absent (a not-yet-loaded
  // module under the SW, or an un-seeded global under a Node test harness), so the
  // orchestrator never throws on a missing dependency -- it simply cannot proceed
  // and surfaces a typed reason.
  function _capture() {
    return (typeof global !== 'undefined' && global.FsbNetworkCapture)
      ? global.FsbNetworkCapture
      : (typeof FsbNetworkCapture !== 'undefined' ? FsbNetworkCapture : null);
  }
  function _synth() {
    return (typeof global !== 'undefined' && global.FsbRecipeSynthesizer)
      ? global.FsbRecipeSynthesizer
      : (typeof FsbRecipeSynthesizer !== 'undefined' ? FsbRecipeSynthesizer : null);
  }
  function _store() {
    return (typeof global !== 'undefined' && global.FsbLearnedRecipeStore)
      ? global.FsbLearnedRecipeStore
      : (typeof FsbLearnedRecipeStore !== 'undefined' ? FsbLearnedRecipeStore : null);
  }
  function _search() {
    return (typeof global !== 'undefined' && global.FsbCapabilitySearch)
      ? global.FsbCapabilitySearch
      : (typeof FsbCapabilitySearch !== 'undefined' ? FsbCapabilitySearch : null);
  }
  function _interp() {
    return (typeof global !== 'undefined' && global.FsbCapabilityInterpreter)
      ? global.FsbCapabilityInterpreter
      : (typeof FsbCapabilityInterpreter !== 'undefined' ? FsbCapabilityInterpreter : null);
  }
  // The MAIN-world credentialed fetch primitive (the same global
  // _runDeclarativeTier reaches via _fetchPrimitive). It exposes executeBoundSpec.
  function _primitive() {
    return (typeof global !== 'undefined' && global.FsbCapabilityFetch)
      ? global.FsbCapabilityFetch
      : (typeof FsbCapabilityFetch !== 'undefined' ? FsbCapabilityFetch : null);
  }

  // ---- _isCleanInterpret(out) ----------------------------------------------
  // A clean interpret is a truthy object with success === true AND a bound spec.
  // Anything else (falsy, a typed RECIPE_* failure, a missing spec) is a failed
  // bind -> the candidate is discarded BEFORE any execute side effect.
  function _isCleanInterpret(out) {
    return !!(out && out.success === true && out.spec);
  }

  // ---- _isCleanExecute(out) -------------------------------------------------
  // A clean replay is a truthy object with success === true. A falsy/non-success
  // result (e.g. a RECIPE_ORIGIN_MISMATCH typed failure) discards the candidate.
  function _isCleanExecute(out) {
    return !!(out && out.success === true);
  }

  // ---- _slugOf(candidate) ---------------------------------------------------
  // The promoted slug is the recipe id (the synthesizer's deterministic catalog
  // key). Returns null when absent so a malformed candidate never pushes an
  // undefined slug into the summary.
  function _slugOf(candidate) {
    var recipe = candidate && candidate.recipe;
    return (recipe && typeof recipe.id === 'string' && recipe.id) ? recipe.id : null;
  }

  // ---- runDiscovery(origin, opts) -> Promise<summary> -----------------------
  //
  // opts = { tabId, maxMs, maxCount, confirmedSensitive }.
  //
  // Returns, on a started session:
  //   { ok:true, promoted:[...slugs], discarded:N, flaggedForPhase32:[...slugs] }
  // or, when the consent gate denied (no capture happened):
  //   { ok:false, reason:'RECIPE_CONSENT_*' }
  // The summary carries slugs + counts ONLY -- never a body, args, header value,
  // or any captured secret.
  async function runDiscovery(origin, opts) {
    opts = opts || {};

    var capture = _capture();
    if (!capture || typeof capture.startSession !== 'function') {
      // No capture module -> cannot run a session. Distinct from a consent denial.
      return { ok: false, reason: 'RECIPE_CAPTURE_UNAVAILABLE' };
    }

    // 1. Start the consent-gated capture. The gate runs INSIDE startSession BEFORE
    //    any debugger attach: a denied / default-OFF / sensitive-unconfirmed origin
    //    returns ok:false + a RECIPE_CONSENT_* reason and NOTHING is captured.
    var started;
    try {
      started = await capture.startSession(origin, {
        tabId: opts.tabId,
        maxMs: opts.maxMs,
        maxCount: opts.maxCount,
        confirmedSensitive: opts.confirmedSensitive
      });
    } catch (_startErr) {
      return { ok: false, reason: 'RECIPE_CAPTURE_START_FAILED' };
    }
    if (!started || started.ok !== true) {
      // The gate denied (or attach/enable failed) -- surface the reason; no capture.
      return { ok: false, reason: (started && started.reason) ? started.reason : 'RECIPE_CONSENT_REQUIRED' };
    }

    // 2. Await the session bound. The capture module ends itself on the time bound
    //    (its internal setTimeout) or the count bound (its in-handler counter); in
    //    both cases the live session is torn down and endSession returns the
    //    collected redacted ObservedCalls. We await the time bound, then call
    //    endSession to obtain (and finalize) the calls. endSession is idempotent: if
    //    the session already ended on the count bound, the second call returns [] and
    //    is a harmless no-op, and the calls were captured before teardown. To avoid
    //    losing the count-bound calls, we snapshot via _getObservedCalls just before
    //    the bound elapses is not possible here (no event hook), so we drive the
    //    bound deterministically: wait maxMs, then endSession. The capture module
    //    unref()s its own timer, so this wait is the authoritative session length.
    var maxMs = (typeof opts.maxMs === 'number' && opts.maxMs > 0) ? opts.maxMs : null;
    var observed = await _awaitSessionEnd(capture, maxMs);

    // 3 + 4. Synthesize -> replay -> promote, per ObservedCall.
    var synth = _synth();
    var interp = _interp();
    var primitive = _primitive();

    var promoted = [];
    var flaggedForPhase32 = [];
    var discarded = 0;

    var calls = Array.isArray(observed) ? observed : [];
    for (var i = 0; i < calls.length; i++) {
      var call = calls[i];

      // 3. Synthesize a CANDIDATE (already validateRecipe-gated by the synthesizer).
      var cand = (synth && typeof synth.synthesize === 'function') ? synth.synthesize(call) : null;
      if (!cand || !cand.recipe) {
        discarded++;
        continue;   // unsynthesizable / schema-invalid -> discard (never stored)
      }

      // The replay needs the real interpret + execute path. If either is absent the
      // candidate cannot be promote-after-replay-gated -> discard (fail closed:
      // never store an unreplayed candidate).
      if (!interp || typeof interp.interpretRecipe !== 'function'
        || !primitive || typeof primitive.executeBoundSpec !== 'function') {
        discarded++;
        continue;
      }

      // 4a. BIND/VERIFY via interpretRecipe with the loader-vouched 'local'
      //     provenance (HI-01). Awaiting a plain object is a no-op, so a sync or
      //     async interpreter both work. A failed bind short-circuits BEFORE any
      //     execute side effect (D-10).
      var interpreted;
      try {
        interpreted = await interp.interpretRecipe(cand.recipe, {}, { trustedProvenance: 'local' });
      } catch (_interpErr) {
        discarded++;
        continue;
      }
      if (!_isCleanInterpret(interpreted)) {
        discarded++;
        continue;   // failed bind -> discard (no replay)
      }

      // 4b. REPLAY the bound spec on the session tab (MAIN-world credentialed fetch
      //     in production; executeBoundSpec re-asserts the active-tab origin-pin).
      var out;
      try {
        out = await primitive.executeBoundSpec(interpreted.spec, opts.tabId);
      } catch (_execErr) {
        discarded++;
        continue;
      }
      if (!_isCleanExecute(out)) {
        discarded++;
        continue;   // failed replay -> DISCARD (D-10; no speculative recipe stored)
      }

      // 4c. CLEAN replay -> PROMOTE to the per-origin learned store + FEED the
      //     capability search index (stored + findable on the next visit).
      var store = _store();
      if (store && typeof store.promote === 'function') {
        try {
          await store.promote(origin, cand.recipe, cand.descriptor);
        } catch (_promoteErr) {
          // A store write failure should not crash the loop; the recipe replayed
          // cleanly but did not persist -- count it as discarded (not promoted) so
          // the summary never claims a non-persisted promotion.
          discarded++;
          continue;
        }
      }
      var search = _search();
      if (search && typeof search.addLearnedRecipe === 'function') {
        try {
          search.addLearnedRecipe(cand.recipe, cand.descriptor);
        } catch (_searchErr) {
          // The recipe is stored; failing to index it is non-fatal (the next
          // SW-restart restore rebuilds the index from the snapshot). Do not undo
          // the promotion -- the recipe is still routable via the catalog T2 path.
        }
      }

      var slug = _slugOf(cand);
      if (slug) { promoted.push(slug); }
      if (cand.flaggedForPhase32 === true && slug) { flaggedForPhase32.push(slug); }
    }

    // 5. Slugs/counts only -- NO body, NO args, NO header values, NO secrets.
    return { ok: true, promoted: promoted, discarded: discarded, flaggedForPhase32: flaggedForPhase32 };
  }

  // ---- _awaitSessionEnd(capture, maxMs) -> Promise<ObservedCall[]> ----------
  //
  // Drives the session to its bound and returns the redacted ObservedCalls. The
  // capture module owns the time bound (its own unref()'d setTimeout) and the count
  // bound (its in-handler counter); this waits the time bound, then calls
  // endSession to obtain + finalize the collected calls. endSession is the
  // authoritative collector (it returns calls with a method + path); if the session
  // already self-ended on the count bound, the calls were collected at that
  // teardown -- so we capture a snapshot of the live calls BEFORE the explicit
  // endSession as a defensive belt, then prefer whichever set is non-empty.
  //
  // maxMs null -> use a short default wait so a caller that omits the bound still
  // gets a bounded session (the capture module's own default still governs its
  // internal timer; this wait just paces the orchestrator).
  function _awaitSessionEnd(capture, maxMs) {
    var waitMs = (typeof maxMs === 'number' && maxMs > 0) ? maxMs : 30000;
    return new Promise(function(resolve) {
      var t = setTimeout(function() {
        // Snapshot the live calls first (count-bound self-end may already have
        // cleared the session, in which case this is []).
        var live = [];
        if (capture && typeof capture._getObservedCalls === 'function') {
          try { live = capture._getObservedCalls() || []; } catch (_e) { live = []; }
        }
        var ended = [];
        if (capture && typeof capture.endSession === 'function') {
          try { ended = capture.endSession('discovery-complete') || []; } catch (_e) { ended = []; }
        }
        // Prefer the endSession return (the canonical method+path-filtered set);
        // fall back to the live snapshot, then to the count-bound session's saved
        // teardown snapshot when endSession is already a no-op.
        var lastEnded = [];
        if ((!ended || !ended.length) && (!live || !live.length)
            && capture && typeof capture._getLastEndedCalls === 'function') {
          try { lastEnded = capture._getLastEndedCalls() || []; } catch (_e) { lastEnded = []; }
        }
        var calls = (ended && ended.length) ? ended : ((live && live.length) ? live : lastEnded);
        resolve(Array.isArray(calls) ? calls : []);
      }, waitMs);
      if (t && typeof t.unref === 'function') { t.unref(); }
    });
  }

  // ---- Export shape (dual-export IIFE; mirror network-capture.js) -----------
  var exportsObj = {
    runDiscovery: runDiscovery
  };

  global.FsbDiscoverySession = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
