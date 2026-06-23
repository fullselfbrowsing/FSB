(function(global) {
  'use strict';

  /**
   * Phase 31 plan 02 (v0.9.99 -- DISC-02 / DISC-04; D-01/D-02/D-03/D-04/D-05/D-08)
   * -- network-capture.js
   *
   * The consent-gated CDP Network capture session. It rides the EXISTING
   * Input-domain chrome.debugger attachment (D-02 -- NO manifest change), adds
   * the Network domain, and observes same-origin XHR/Fetch API calls, redacting
   * each AT the event handler (D-05) into an in-memory ObservedCall list. It is
   * the SW-side session manager behind the user-initiated, time-boxed AND
   * count-bounded discovery action (D-01).
   *
   * Surface (the LOCKED interface, 31-01-PLAN.md):
   *   startSession(origin, opts) -> Promise<{ ok, reason?, sessionId? }>
   *     opts = { tabId, maxMs, maxCount, confirmedSensitive }
   *   endSession(reason) -> ObservedCall[]   (the collected redacted calls)
   *   _onCdpEvent(source, method, params)     -- method-dispatched handler
   *   _filterResourceType(type) -> bool       -- XHR/Fetch only (D-04)
   *   _getObservedCalls() -> ObservedCall[]    -- test hook over the live session
   *
   * THE GATE (RESEARCH Pattern 3, BEFORE any attach -- so a default-OFF / denied
   * origin never attaches the debugger):
   *   1. FsbServiceDenylist.isDenied(origin).denied -> RECIPE_CONSENT_DENIED
   *   2. getConsentForOrigin(readPolicies(), origin).mode === 'off'
   *        -> RECIPE_CONSENT_REQUIRED
   *   3. FsbServiceDenylist.classify(origin).sensitive && !opts.confirmedSensitive
   *        -> RECIPE_CONSENT_SENSITIVE_UNCONFIRMED
   * Ask / Auto (non-sensitive) -> proceed.
   *
   * Capture (RESEARCH Pattern 1):
   *   * filter params.type to XHR/Fetch (drop Document/Image/Stylesheet/Font/
   *     Media -- D-04)
   *   * same-origin only: new URL(request.url).origin === session.origin (drop
   *     cross-origin -- the origin-pin precondition, D-04)
   *   * redact AT the handler (D-05) -- the redacted ObservedCall is the only
   *     artifact that leaves the event frame
   *   * responseReceived attaches { status, mimeType } off the event -- the
   *     response BODY is NEVER fetched (D-08; no CDP response-body command)
   *   * a non-Network method is a no-op (Input sendCommand traffic is unaffected
   *     -- DISC-02)
   *
   * Ownership-safe release (RESEARCH Pitfall 1): endSession removes the listeners
   * and sends Network.disable (release the domain, KEEP the attachment), and
   * detaches the tab ONLY if capture was the attaching owner (weAttached) AND no
   * Input op holds the tab (keyboardEmulator.isAttachedTo). A capture session
   * NEVER breaks the KeyboardEmulator Input emulation and never leaks an
   * attachment.
   *
   * Module shell: the dual-export IIFE mirror of consent-policy-store.js /
   * service-denylist.js. The service worker reads global.FsbNetworkCapture after
   * importScripts; Node tests require() the module.exports. typeof-guarded
   * SW-global accessors degrade gracefully under the Node test harness (chrome /
   * the consent + denylist + redactor modules are mocked / loaded AFTER this
   * module). Kept dynamic-code-FREE (no run-string-as-code / function-from-string
   * / dynamic module loader constructs, even in comments).
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Defaults (Claude's discretion per CONTEXT A1) -----------------------
  // Short time bound + small count cap: a discovery session is a brief, explicit
  // observation, not a long-lived tap (D-01; the banner must not linger,
  // RESEARCH Pitfall 2).
  var DEFAULT_MAX_MS = 30000;
  var DEFAULT_MAX_COUNT = 25;

  // ---- Consent rejection reason codes (RESEARCH Pattern 3) -----------------
  // Bare RECIPE_CONSENT_* strings the RED suite asserts (isConsentReason: a
  // string with the RECIPE_CONSENT_ prefix). The interpreter's createRecipeError
  // is NOT a dependency here -- the gate runs standalone above the attach.
  var REASON_DENIED = 'RECIPE_CONSENT_DENIED';
  var REASON_REQUIRED = 'RECIPE_CONSENT_REQUIRED';
  var REASON_SENSITIVE = 'RECIPE_CONSENT_SENSITIVE_UNCONFIRMED';

  // ---- The single active session (module-level; one at a time) -------------
  var _session = null;
  var _sessionSeq = 0;

  // ---- typeof-guarded SW-global accessors ----------------------------------
  // In the service worker the dependency was set on globalThis by importScripts,
  // so the global read wins. Under the Node test harness a suite may load only
  // this module (e.g. the dispatch suite seeds chrome.storage but does not
  // pre-load the consent module as a global); there, fall back to require()-ing
  // the sibling module (which also sets the global), so the accessor degrades
  // gracefully either way. The require fallback is guarded by typeof require and
  // wrapped so a missing sibling never throws on the boot path.
  function _requireSibling(rel) {
    if (typeof require !== 'function') { return null; }
    try { return require(rel); } catch (_e) { return null; }
  }
  function _consentStore() {
    if (typeof globalThis !== 'undefined' && globalThis.FsbConsentPolicyStore) {
      return globalThis.FsbConsentPolicyStore;
    }
    return _requireSibling('./consent-policy-store.js');
  }
  function _denylist() {
    if (typeof globalThis !== 'undefined' && globalThis.FsbServiceDenylist) {
      return globalThis.FsbServiceDenylist;
    }
    return _requireSibling('./service-denylist.js');
  }
  function _redactor() {
    if (typeof globalThis !== 'undefined' && globalThis.FsbNetworkCaptureRedactor) {
      return globalThis.FsbNetworkCaptureRedactor;
    }
    return _requireSibling('./network-capture-redactor.js');
  }
  function _chromeDebugger() {
    var c = (typeof globalThis !== 'undefined' && globalThis.chrome) ? globalThis.chrome : null;
    return (c && c.debugger) ? c.debugger : null;
  }
  // The Input-op owner (KeyboardEmulator). Present in the SW; absent under Node.
  // Used ONLY on the release side to avoid detaching out from under an Input op.
  function _keyboardEmulator() {
    return (typeof globalThis !== 'undefined' && globalThis.keyboardEmulator)
      ? globalThis.keyboardEmulator : null;
  }

  // ---- _filterResourceType(type) -> bool (D-04) ----------------------------
  // XHR / Fetch only; every subresource type (Document / Image / Stylesheet /
  // Font / Media / Script / WebSocket / ...) is dropped.
  function _filterResourceType(type) {
    return type === 'XHR' || type === 'Fetch';
  }

  // ---- attach helpers (promise + callback forms) ---------------------------
  // chrome.debugger.attach / sendCommand support both a callback and a
  // promise-returning form. The capture path calls them WITHOUT a callback and
  // awaits the returned promise (the form the test stub + MV3 both provide).
  function _attach(dbg, tabId) {
    return Promise.resolve().then(function() {
      return dbg.attach({ tabId: tabId }, '1.3');
    });
  }
  function _detach(dbg, tabId) {
    return Promise.resolve().then(function() {
      return dbg.detach({ tabId: tabId });
    }).catch(function() { /* best-effort; a stale/foreign attach detach may fail */ });
  }
  function _send(dbg, tabId, method, params) {
    return Promise.resolve().then(function() {
      return dbg.sendCommand({ tabId: tabId }, method, params || {});
    });
  }

  // ---- collision-safe attach (MIRRORED from background.js:13920-13935) ------
  // Attempt the attach; on "Another debugger is already attached", force-detach
  // and retry. Returns { attached, weAttached }: weAttached is true ONLY when WE
  // performed a fresh attach (so the release side knows ownership, Pitfall 1).
  // If the FIRST attach succeeds, we are the owner. If the first attach reports
  // "already attached", the Input domain (or another owner) holds it: we
  // force-detach + re-attach to add our Network domain, but we do NOT claim
  // exclusive ownership on the release side (weAttached stays false) so we never
  // detach out from under the prior owner.
  function _collisionSafeAttach(dbg, tabId) {
    return _attach(dbg, tabId).then(function() {
      return { attached: true, weAttached: true };
    }, function(attachErr) {
      var msg = (attachErr && attachErr.message) ? String(attachErr.message) : '';
      if (msg.indexOf('Another debugger is already attached') !== -1) {
        return _detach(dbg, tabId).then(function() {
          return _attach(dbg, tabId).then(function() {
            // Re-attached to add the Network domain, but the tab already had an
            // owner before us -- do NOT claim exclusive ownership.
            return { attached: true, weAttached: false };
          });
        });
      }
      // A non-collision attach error propagates (startSession handles it).
      throw attachErr;
    });
  }

  // ---- _clearTimer ----------------------------------------------------------
  function _clearTimer() {
    if (_session && _session.timer) {
      try { clearTimeout(_session.timer); } catch (_e) { /* best-effort */ }
      _session.timer = null;
    }
  }

  // ---- _onCdpEvent(source, method, params) (RESEARCH Pattern 1) ------------
  // Method-dispatched. Ignores events that are not ours (no session, or a
  // different tabId). A non-Network method is a no-op (Input traffic unaffected,
  // DISC-02).
  function _onCdpEvent(source, method, params) {
    if (!_session) { return; }
    if (!source || source.tabId !== _session.tabId) { return; }   // not our session

    if (method === 'Network.requestWillBeSent') {
      var p = params || {};
      // D-04: XHR/Fetch only -- drop Document/Image/Stylesheet/Font/Media/etc.
      if (!_filterResourceType(p.type)) { return; }
      var request = (p.request && typeof p.request === 'object') ? p.request : {};
      // D-04: same-origin only -- parse the origin in try/catch and drop a
      // cross-origin (or unparseable) request (the origin-pin precondition).
      var reqOrigin = null;
      try { reqOrigin = new URL(request.url).origin; } catch (_e) { return; }
      if (reqOrigin !== _session.origin) { return; }
      // REDACT AT CAPTURE (D-05): the redacted ObservedCall is the only artifact
      // that leaves the event frame. Keyed by requestId so responseReceived can
      // attach the response shape later.
      var red = _redactor();
      if (!red) { return; }   // no redactor -> capture nothing rather than leak raw
      var observed = red.redactRequest(request);
      observed.requestId = p.requestId;
      _session.calls.set(p.requestId, observed);
      // Count bound (D-01): a small cap ends the session promptly.
      _session.remaining -= 1;
      if (_session.remaining <= 0) { endSession('count-bound'); }
      return;
    }

    if (method === 'Network.responseReceived') {
      var rp = params || {};
      var c = _session.calls.get(rp.requestId);
      if (c) {
        // status + mimeType off the event ONLY -- the response BODY is NEVER
        // fetched (D-08; no CDP response-body command path exists here).
        var red2 = _redactor();
        c.responseShape = red2 ? red2.redactResponse(rp.response) : null;
      }
      return;
    }

    // Any other method (Input.*, Page.*, ...) is a no-op: the handler is
    // method-dispatched, so Input sendCommand traffic is unaffected (DISC-02).
  }

  // ---- _runGate(origin, opts) -> { ok, reason? } ---------------------------
  // The Phase-30 consent gate reused verbatim, BEFORE any attach (Pattern 3).
  // Returns ok:true to proceed, or ok:false + a RECIPE_CONSENT_* reason.
  function _runGate(origin, opts) {
    var dl = _denylist();
    // (1) Denylist first -- a denied origin is BLOCKED even under Auto (D-03).
    if (dl && typeof dl.isDenied === 'function') {
      var d = dl.isDenied(origin);
      if (d && d.denied) { return Promise.resolve({ ok: false, reason: REASON_DENIED }); }
    }
    var store = _consentStore();
    // (2) Consent: default-OFF is rejected (DISC-04). If the consent store is
    // absent, fail CLOSED (treat as OFF) -- never attach without a consent read.
    if (!store || typeof store.readPolicies !== 'function' || typeof store.getConsentForOrigin !== 'function') {
      return Promise.resolve({ ok: false, reason: REASON_REQUIRED });
    }
    return Promise.resolve(store.readPolicies()).then(function(envelope) {
      var consent = store.getConsentForOrigin(envelope, origin);
      if (!consent || consent.mode === 'off') {
        return { ok: false, reason: REASON_REQUIRED };
      }
      // (3) Sensitive origins need the extra-confirm flag (D-03).
      if (dl && typeof dl.classify === 'function') {
        var klass = dl.classify(origin);
        if (klass && klass.sensitive && !(opts && opts.confirmedSensitive)) {
          return { ok: false, reason: REASON_SENSITIVE };
        }
      }
      return { ok: true };
    });
  }

  // ---- startSession(origin, opts) -> Promise<{ ok, reason?, sessionId? }> ---
  async function startSession(origin, opts) {
    opts = opts || {};

    // If a prior session is somehow still live, release it first (one at a
    // time). Best-effort; never throws.
    if (_session) {
      try { endSession('superseded'); } catch (_e) { /* best-effort */ }
    }

    // THE GATE (Pattern 3) -- BEFORE attach. A rejection here means NO attach /
    // Network.enable ever runs (the consent suite asserts zero Network.enable on
    // the OFF / denied paths).
    var verdict = await _runGate(origin, opts);
    if (!verdict || verdict.ok !== true) {
      return { ok: false, reason: (verdict && verdict.reason) ? verdict.reason : REASON_REQUIRED };
    }

    var tabId = opts.tabId;
    var maxMs = (typeof opts.maxMs === 'number' && opts.maxMs > 0) ? opts.maxMs : DEFAULT_MAX_MS;
    var maxCount = (typeof opts.maxCount === 'number' && opts.maxCount > 0) ? opts.maxCount : DEFAULT_MAX_COUNT;

    var dbg = _chromeDebugger();
    if (!dbg || typeof dbg.attach !== 'function' || typeof dbg.sendCommand !== 'function') {
      // No debugger surface available -- cannot capture. This is NOT a consent
      // rejection; surface a distinct reason so a caller can tell them apart.
      return { ok: false, reason: 'RECIPE_CAPTURE_UNAVAILABLE' };
    }

    // Collision-safe attach (MIRRORED from bg.js:13920-13935), REUSING the
    // existing Input-domain attachment -- NO manifest change (D-02).
    var attachResult;
    try {
      attachResult = await _collisionSafeAttach(dbg, tabId);
    } catch (attachErr) {
      return { ok: false, reason: 'RECIPE_CAPTURE_ATTACH_FAILED' };
    }

    // Add the Network domain to that SAME attachment (D-02).
    try {
      await _send(dbg, tabId, 'Network.enable', {});
    } catch (enableErr) {
      // Could not enable Network -- release ownership-safely and bail.
      if (attachResult && attachResult.weAttached) {
        var ke = _keyboardEmulator();
        if (!(ke && typeof ke.isAttachedTo === 'function' && ke.isAttachedTo(tabId))) {
          await _detach(dbg, tabId);
        }
      }
      return { ok: false, reason: 'RECIPE_CAPTURE_ENABLE_FAILED' };
    }

    _sessionSeq += 1;
    var sessionId = 'cap-' + _sessionSeq + '-' + Date.now();
    _session = {
      sessionId: sessionId,
      origin: origin,
      tabId: tabId,
      remaining: maxCount,
      maxCount: maxCount,
      weAttached: !!(attachResult && attachResult.weAttached),
      calls: new Map(),
      detachListener: null,
      timer: null
    };

    // NOTE (ME-01): the method-dispatched onEvent listener is registered EXACTLY
    // ONCE at service-worker boot (background.js) and is gated by `if (!_session)
    // return`, so it is a no-op outside an active session. We deliberately do NOT
    // add it per-session here: re-adding the SAME function reference and then
    // removeListener-ing it in endSession would tear down the boot registration too
    // (identical reference), and in a non-deduping harness it would double-fire
    // _onCdpEvent (double-decrementing remaining, ending at half the count bound).
    // The boot registration is the single owner; endSession leaves it intact.

    // Register onDetach so a Chrome-initiated detach (canceled_by_user when the
    // user dismisses the banner, target_closed on tab close) tears the session
    // down cleanly (Pitfall 1).
    if (dbg.onDetach && typeof dbg.onDetach.addListener === 'function') {
      var onDetach = function(source) {
        if (_session && source && source.tabId === _session.tabId) {
          endSession('detached');
        }
      };
      _session.detachListener = onDetach;
      dbg.onDetach.addListener(onDetach);
    }

    // Time bound (D-01): a setTimeout ends the session so the banner does not
    // linger. unref() so a stray timer never holds a Node test process open.
    var t = setTimeout(function() { endSession('time-bound'); }, maxMs);
    if (t && typeof t.unref === 'function') { t.unref(); }
    _session.timer = t;

    return { ok: true, sessionId: sessionId };
  }

  // ---- _getObservedCalls() -> ObservedCall[] (test hook) -------------------
  // Returns the redacted ObservedCalls tracked on the live session (the values
  // of _session.calls). Empty array when no session.
  function _getObservedCalls() {
    if (!_session || !_session.calls) { return []; }
    var out = [];
    _session.calls.forEach(function(v) { out.push(v); });
    return out;
  }

  // ---- endSession(reason) -> ObservedCall[] (Pitfall 1) --------------------
  // Removes the per-session onDetach listener, releases the Network domain
  // (Network.disable -- KEEP the attachment), and detaches the tab ONLY if WE
  // attached AND no Input op holds the tab. Returns the collected ObservedCalls
  // (those with a method + path) for Plan 06's glue, then clears the session.
  //
  // ME-01: the onEvent (_onCdpEvent) listener is owned by the boot-time
  // registration (background.js) and is NOT removed here -- removing it would tear
  // down the permanent boot registration (same function reference) so the NEXT
  // session would observe nothing. _onCdpEvent no-ops once _session is cleared
  // below, so leaving it registered is inert between sessions.
  function endSession(reason) {
    void reason;
    if (!_session) { return []; }

    var session = _session;
    var dbg = _chromeDebugger();

    _clearTimer();

    // Remove the per-session onDetach listener only (the onEvent listener is the
    // boot-owned permanent registration -- see the ME-01 note above).
    if (dbg && dbg.onDetach && typeof dbg.onDetach.removeListener === 'function' && session.detachListener) {
      try { dbg.onDetach.removeListener(session.detachListener); } catch (_e) { /* best-effort */ }
    }

    // Collect the ObservedCalls (method + path present) BEFORE clearing.
    var collected = [];
    session.calls.forEach(function(c) {
      if (c && typeof c.method === 'string' && typeof c.path === 'string') {
        collected.push(c);
      }
    });

    // Clear the live session reference NOW so a re-entrant onDetach (fired by the
    // detach below) sees no session and is a no-op.
    _session = null;

    // Release the Network domain (KEEP the attachment) -- best-effort, fire and
    // forget (we do not await in this synchronous teardown).
    if (dbg && typeof dbg.sendCommand === 'function' && session.tabId != null) {
      try { _send(dbg, session.tabId, 'Network.disable', {}); } catch (_e) { /* best-effort */ }
    }

    // Detach the tab ONLY if capture was the attaching owner AND no Input op
    // holds the tab (do NOT detach out from under a concurrent KeyboardEmulator
    // Input op -- Pitfall 1). Mirror the bg.js:13915 isAttachedTo coordination.
    if (session.weAttached && dbg && typeof dbg.detach === 'function' && session.tabId != null) {
      var ke = _keyboardEmulator();
      var inputHolds = !!(ke && typeof ke.isAttachedTo === 'function' && ke.isAttachedTo(session.tabId));
      if (!inputHolds) {
        try { _detach(dbg, session.tabId); } catch (_e) { /* best-effort */ }
      }
    }

    return collected;
  }

  // ---- Export shape (dual-export IIFE; mirror consent-policy-store.js) ------
  var exportsObj = {
    startSession: startSession,
    endSession: endSession,
    _onCdpEvent: _onCdpEvent,
    _filterResourceType: _filterResourceType,
    _getObservedCalls: _getObservedCalls
  };

  global.FsbNetworkCapture = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;            // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
