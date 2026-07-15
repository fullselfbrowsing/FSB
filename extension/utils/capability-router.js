(function(global) {
  'use strict';

  /**
   * Phase 29 Plan 02 (v0.9.99 Native Capability Catalog) -- capability-router.js
   *
   * The tiered capability ROUTER (CAT-01, CAT-05, D-01/D-02/D-03). The single engine
   * BOTH front doors share (INV-02): the MCP invoke_capability dispatcher handler AND
   * the autopilot tool-executor branch (Plans 03/04) call the SAME SW-global
   * FsbCapabilityRouter.invoke(...). One engine, two thin front doors -- no parallel
   * autopilot stack.
   *
   * invoke(slug, args, ctx) selects a tier from the authoritative catalog
   * (T0 -> T1a -> T1b -> T2 -> T3), biased by the tab origin (the bias lives in the
   * catalog's resolve(); the router routes whatever single entry it returns), and
   * returns either { success:true, ...result, tier } on a structured hit OR the
   * dual-field typed-error shape { success:false, code, errorCode, error } carrying a
   * typed fall-through reason. The typed reason surfaces VERBATIM to MCP via the
   * /^RECIPE_.+$/ passthrough (mcp/src/errors.ts:137) -- NO errors.ts edit.
   *
   * Tier semantics (29-CONTEXT.md D-05/D-06/D-07):
   *   - T0  : no-auth declarative special-case (a recipe with authStrategy 'none').
   *           Shares the T1b lifted body; stamped tier:'T0'.
   *   - T1a : bundled imperative head -- handler.handle(args, ctx). REAL this phase.
   *           Plan 03 lands the handlers; this router dispatches to them now.
   *   - T1b : declarative recipe bound by the interpreter then run by the MAIN-world
   *           credentialed primitive. REAL this phase (the lifted routerless body
   *           from mcp-tool-dispatcher.js:2202-2220).
   *   - T2  : learned-recipe STUB -> RECIPE_LEARN_PENDING (no-op; real learning is
   *           Phase 31). NO execution.
   *   - T3  : DOM-fallback SEAM -> RECIPE_DOM_FALLBACK_PENDING (real self-healing is
   *           Phase 32). Returns the reason ONLY -- it MUST NOT run the next tier.
   *   - unknown slug / unknown tier -> RECIPE_NOT_FOUND.
   *
   * PURE MODULE (D-01, Wall-1): no direct global side-effecting host calls, no
   * network, free of dynamic-code constructs even in comments. It is on
   * RECIPE_PATH_ALLOWLIST (Check 4 fails CI closed otherwise). Collaborators are read
   * via typeof-guarded accessors so Node unit tests inject stubs. Do NOT fold this
   * into capability-interpreter.js (that would break the interpreter's
   * validate+bind+STOP purity charter).
   *
   * THE PIN (D-12, 27-D-08, Pitfall 3 credential-replay): the router routes; it NEVER
   * re-targets. Every credentialed call goes through the execution primitive's
   * executeBoundSpec, which re-asserts the active-tab origin-pin BEFORE any side
   * effect and returns RECIPE_ORIGIN_MISMATCH on a mismatch with no side effect. The
   * router is NOT a pin bypass -- it neither queries tabs nor injects into a page.
   *
   * Module shell: the dual-export IIFE mirror of capability-interpreter.js -- the
   * service worker reads global.FsbCapabilityRouter after importScripts; Node tests
   * require() the module.exports.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- Typed fall-through error helper (clone capability-interpreter.js:85-93) ---
  //
  // RETURN (never throw). Set BOTH `code` and `errorCode` (plus `error`) so
  // errors.ts resolveErrorKey surfaces the RECIPE_* code verbatim from either field.
  // This dual-field shape is the ONLY one that survives the /^RECIPE_.+$/ MCP
  // passthrough -- it is load-bearing for CAT-05.
  function _err(code, extra) {
    var out = { success: false, code: code, errorCode: code, error: code };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) { out[k] = extra[k]; }
      }
    }
    return out;
  }

  function _getValidator(schema, draft) {
    if (typeof CfworkerJsonSchema === 'undefined' || !CfworkerJsonSchema || !CfworkerJsonSchema.Validator) {
      return null;
    }
    return new CfworkerJsonSchema.Validator(schema, draft || '2020-12', false);
  }

  function _paramsHasRemoteRef(node) {
    if (!node || typeof node !== 'object') { return false; }
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        if (_paramsHasRemoteRef(node[i])) { return true; }
      }
      return false;
    }
    for (var key in node) {
      if (!Object.prototype.hasOwnProperty.call(node, key)) { continue; }
      if (key === '$ref' || key === '$dynamicRef') { return true; }
      if (_paramsHasRemoteRef(node[key])) { return true; }
    }
    return false;
  }

  function _handlerParamsSchema(entry) {
    if (!entry) { return null; }
    if (entry.params && typeof entry.params === 'object') { return entry.params; }
    if (entry.handler && entry.handler.params && typeof entry.handler.params === 'object') { return entry.handler.params; }
    if (entry.descriptor && entry.descriptor.params && typeof entry.descriptor.params === 'object') { return entry.descriptor.params; }
    return null;
  }

  function _validateHandlerParams(entry, args) {
    var schema = _handlerParamsSchema(entry);
    if (!schema) { return null; }
    if (_paramsHasRemoteRef(schema)) {
      return _err('RECIPE_SCHEMA_INVALID', { reason: 'handler-params-ref' });
    }
    var safeArgs = (args && typeof args === 'object') ? args : {};
    try {
      var validator = _getValidator(schema, '2020-12');
      if (!validator) {
        return _err('RECIPE_SCHEMA_INVALID', { error: 'validator unavailable' });
      }
      var result = validator.validate(safeArgs);
      if (!result || result.valid !== true) {
        return _err('RECIPE_SCHEMA_INVALID', {
          reason: 'handler-params',
          errors: (result && result.errors) ? result.errors : []
        });
      }
    } catch (e) {
      return _err('RECIPE_SCHEMA_INVALID', {
        reason: 'handler-params-schema',
        error: (e && e.message) ? e.message : String(e)
      });
    }
    return null;
  }

  // ---- typeof-guarded collaborator accessors (mirror capability-search.js:57-69) -
  //      Read the SW globals this way so the Node unit harness can inject stubs
  //      (the in-memory catalog stub, the recorder-backed fetch primitive). A
  //      missing collaborator degrades to null, never throws.
  function _catalog() {
    return (typeof FsbCapabilityCatalog !== 'undefined' && FsbCapabilityCatalog) ? FsbCapabilityCatalog : null;
  }
  function _search() {
    return (typeof FsbCapabilitySearch !== 'undefined' && FsbCapabilitySearch) ? FsbCapabilitySearch : null;
  }
  function _interp() {
    return (typeof FsbCapabilityInterpreter !== 'undefined' && FsbCapabilityInterpreter) ? FsbCapabilityInterpreter : null;
  }
  function _fetchPrimitive() {
    return (typeof FsbCapabilityFetch !== 'undefined' && FsbCapabilityFetch) ? FsbCapabilityFetch : null;
  }
  function _googleSheetsContext() {
    var api = (typeof FsbGoogleSheetsApi !== 'undefined' && FsbGoogleSheetsApi)
      ? FsbGoogleSheetsApi
      : ((typeof globalThis !== 'undefined' && globalThis.FsbGoogleSheetsApi) ? globalThis.FsbGoogleSheetsApi : null);
    if (!api) { return null; }
    var methods = ['getSpreadsheet', 'getValues', 'updateValues', 'appendValues', 'clearValues'];
    var narrow = {};
    for (var i = 0; i < methods.length; i++) {
      (function (method) {
        if (typeof api[method] === 'function') {
          narrow[method] = function (params) { return api[method](params); };
        }
      })(methods[i]);
    }
    return Object.freeze(narrow);
  }

  // ---- Phase 32 (HEAL-01/HEAL-03/HEAL-04) self-healing collaborator accessors --
  //      The post-executeBoundSpec rot classifier, the learned-recipe quarantine
  //      store, and the consent-gated re-learn discovery session. Each is reached
  //      the SAME typeof-guarded way as _catalog()/_search() so the Phase-29 head
  //      (which injects none of them) DEGRADES to a no-op: a missing rot detector
  //      means NO classify hook fires and the existing stamp+return is preserved
  //      byte-for-byte; a missing store / discovery session means the best-effort
  //      quarantine + re-learn calls are simply skipped. NEVER throws.
  function _rotDetector() {
    // SW path: the detector is published on the global by capability-rot-detector.js
    // (importScripts'd before this module in background.js). Node path: the global is
    // not set by the router unit harness, so fall back to a guarded require of the
    // sibling module (mirrors tool-executor.js:24's typeof-or-require split). The
    // require is a STATIC module load -- NOT any run-string-as-code construct -- so
    // the recipe-path guard stays GREEN; it runs ONLY under Node (the SW worker scope
    // has no require, so this branch is inert there).
    if (typeof FsbCapabilityRotDetector !== 'undefined' && FsbCapabilityRotDetector) {
      return FsbCapabilityRotDetector;
    }
    if (typeof require === 'function') {
      try { return require('./capability-rot-detector.js'); } catch (_e) { return null; }
    }
    return null;
  }
  function _learnedStore() {
    return (typeof FsbLearnedRecipeStore !== 'undefined' && FsbLearnedRecipeStore) ? FsbLearnedRecipeStore : null;
  }
  function _discoverySession() {
    return (typeof FsbDiscoverySession !== 'undefined' && FsbDiscoverySession) ? FsbDiscoverySession : null;
  }

  // ---- SCALE-02 (Phase 43): the per-origin re-learn COALESCING + back-off scheduler --
  //      Reached the SAME typeof-guarded way as the other self-heal collaborators so a
  //      harness that injects no scheduler DEGRADES to the legacy fire-and-forget
  //      re-learn (the pre-SCALE-02 behavior is preserved byte-for-byte when the module
  //      is absent). SW path: FsbRelearnScheduler is published on the global by
  //      relearn-scheduler.js (importScripts'd before this module in background.js). Node
  //      path: the global is unset under the router unit harness, so fall back to a
  //      guarded STATIC require of the sibling module (mirrors _rotDetector()'s split) --
  //      the require is a static module load, NOT a run-string-as-code construct, so the
  //      recipe-path guard stays GREEN; it runs ONLY under Node (the SW scope has no
  //      require, so this branch is inert there). NEVER throws.
  function _relearnScheduler() {
    if (typeof FsbRelearnScheduler !== 'undefined' && FsbRelearnScheduler) {
      return FsbRelearnScheduler;
    }
    if (typeof require === 'function') {
      try { return require('./relearn-scheduler.js'); } catch (_e) { return null; }
    }
    return null;
  }

  // ---- HEAL-03 + SCALE-02: quarantine + recurrence + COALESCED consent-gated re-learn -
  //
  // Called ONLY on a classifyRecipeBroken broken:true verdict (a real rot). Every call
  // is FIRE-AND-FORGET -- it never blocks, never awaits into the invoke return path, and
  // a rejection is swallowed (a failed quarantine / re-learn must not poison the typed
  // RECIPE_DOM_FALLBACK_PENDING the model acts on).
  //
  //   - QUARANTINE: a T2 learned slug demotes via FsbLearnedRecipeStore.quarantine
  //     (persisted flag-not-delete, D-09); a bundled (T0/T1b/T1a) slug demotes via
  //     the catalog's session-only quarantineBundled (D-12). The recipe is DEMOTED,
  //     never deleted -- resolve() then falls through to the DOM fallback (D-11).
  //   - RECURRENCE (SCALE-02): record the broken verdict against (origin, slug) via the
  //     learned store's recordRot so the recurrence counter accumulates IN PRODUCTION
  //     (systemic-vs-transient classification + the degraded surfacing getOriginHealth
  //     reads it both go inert without this call). Broken-only by contract -- a typed
  //     RECIPE_* security passthrough classifies broken:false and never reaches here.
  //   - RE-LEARN (SCALE-02 thundering-herd prevention): runDiscovery(origin, { tabId })
  //     is the existing consent-gated discovery (D-10). It self-enforces the Phase-30
  //     consent gate INSIDE startSession before any capture, so a default-OFF / denied /
  //     sensitive origin re-learns NOTHING. At 119-app scale, one vendor changing
  //     site-wide rots N recipes on one origin -> N broken verdicts -> N fire-and-forget
  //     runDiscovery calls (N concurrent CDP attaches). We now route the re-learn THROUGH
  //     FsbRelearnScheduler.scheduleRelearn(origin, boundRunDiscovery, opts): the N calls
  //     for one origin within the coalescing window COLLAPSE to ONE consent-gated
  //     re-learn, with exponential back-off on repeated failure. The scheduler ONLY
  //     INVOKES the supplied fn -- it never re-implements capture/consent -- so the gate
  //     still runs inside runDiscovery exactly as before; this is purely a debounce LAYER
  //     on the existing consent-gated re-learn. When the scheduler module is ABSENT (a
  //     harness that injects none), we DEGRADE to the legacy direct fire-and-forget so
  //     the pre-SCALE-02 behavior is preserved byte-for-byte.
  function _quarantineAndRelearn(slug, tierLabel, origin, tabId) {
    var store = _learnedStore();
    var catalog = _catalog();
    var discovery = _discoverySession();
    var scheduler = _relearnScheduler();

    try {
      if (tierLabel === 'T2') {
        if (store && typeof store.quarantine === 'function') {
          var qp = store.quarantine(slug, origin);
          if (qp && typeof qp.catch === 'function') { qp.catch(function() { /* best-effort */ }); }
        }
      } else if (catalog && typeof catalog.quarantineBundled === 'function') {
        catalog.quarantineBundled(slug);
      }
    } catch (_qe) { /* best-effort; quarantine must not poison the fallback return */ }

    // SCALE-02 recurrence: increment the (origin, slug) recurrence counter on the broken
    // verdict so systemic-vs-transient + the degraded surfacing accumulate in production.
    try {
      if (store && typeof store.recordRot === 'function'
          && typeof origin === 'string' && origin
          && typeof slug === 'string' && slug) {
        store.recordRot(origin, slug);
      }
    } catch (_re) { /* best-effort; recurrence accounting must never poison the fallback */ }

    try {
      if (discovery && typeof discovery.runDiscovery === 'function') {
        // The consent-gated re-learn, bound to the origin. The scheduler (and the legacy
        // fallback) INVOKE this -- the Phase-30 gate runs INSIDE runDiscovery either way.
        var boundRunDiscovery = function(_originArg) {
          return discovery.runDiscovery(origin, { tabId: tabId });
        };
        if (scheduler && typeof scheduler.scheduleRelearn === 'function') {
          // COALESCED + back-off: N broken verdicts on one origin within the window
          // collapse to ONE consent-gated re-learn (no thundering-herd of CDP attaches).
          scheduler.scheduleRelearn(origin, boundRunDiscovery);
        } else {
          // DEGRADE (scheduler absent): the legacy direct fire-and-forget re-learn.
          var dp = boundRunDiscovery(origin);
          if (dp && typeof dp.catch === 'function') { dp.catch(function() { /* best-effort */ }); }
        }
      }
    } catch (_de) { /* best-effort; re-learn is opportunistic, never blocking */ }
  }

  // ---- Phase 30 (GOV-01..GOV-07) consent-gate collaborator accessors --------
  //      The consent gate sits at the invoke chokepoint (D-01/INV-02). It reads
  //      these SW globals the same typeof-guarded way as _catalog()/_search() so
  //      the Node unit harness injects stubs. Degradation posture (NEVER throw):
  //        - consent store ABSENT  -> the gate is NOT engaged (the Phase-29 head
  //          predates consent; its router unit tests inject no store and must keep
  //          dispatching). The gate enforces ONLY once the store module is loaded.
  //        - consent store PRESENT but origin unseen / mode 'off' -> fail CLOSED
  //          to RECIPE_CONSENT_REQUIRED (default-OFF, GOV-01).
  //        - denylist ABSENT       -> nothing denied AND nothing sensitive.
  //        - audit log ABSENT      -> the append is skipped (best-effort).
  function _consentStore() {
    return (typeof FsbConsentPolicyStore !== 'undefined' && FsbConsentPolicyStore) ? FsbConsentPolicyStore : null;
  }
  function _auditLog() {
    return (typeof FsbAuditLog !== 'undefined' && FsbAuditLog) ? FsbAuditLog : null;
  }
  function _denylist() {
    return (typeof FsbServiceDenylist !== 'undefined' && FsbServiceDenylist) ? FsbServiceDenylist : null;
  }
  async function _ensureDenylistReady(denylist) {
    if (!denylist || typeof denylist.load !== 'function') { return true; }
    try {
      await denylist.load();
      return true;
    } catch (_e) {
      return false;
    }
  }
  function _signatureMod() {
    return (typeof FsbCapabilitySignature !== 'undefined' && FsbCapabilitySignature) ? FsbCapabilitySignature : null;
  }

  // ME-01 (fail-closed-on-partial-degradation): the "consent store absent =>
  // allow" escape hatch exists ONLY to keep the pure Phase-29 router unit harness
  // (which predates consent and injects NONE of the four Phase-30 security
  // modules) dispatching. In production all four modules (signature / audit /
  // denylist / consent store) are importScripts'd together at SW boot, so the
  // presence of ANY ONE of them means this is a Phase-30 deployment where a
  // MISSING consent store is a DEGRADED gate, not a pre-consent baseline -- and a
  // credential-replay gate must FAIL CLOSED on degradation, never fall open. This
  // returns true only when ALL FOUR are absent (the genuine Phase-29 harness).
  function _isPhase29HarnessNoSecurityModules() {
    return !_consentStore() && !_auditLog() && !_denylist() && !_signatureMod();
  }

  // ---- Mutating-method set (capability-fetch.js:228 mirror, D-04) -----------
  //      Duplicated locally so the pure router classifies a slug's side-effect
  //      without a hard dependency on the fetch primitive being loaded. A
  //      POST/PUT/PATCH/DELETE is mutating; GET/HEAD are reads.
  var MUTATING_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };

  // ---- Derive the request method + side-effect class from a catalog entry ---
  //      method: the declarative recipe's method first (T1b/T0), else a handler /
  //      descriptor hint, else 'GET' (the safe read default). sideEffectClass:
  //      the entry's descriptor (or a top-level hint the unit harness passes),
  //      promoted to 'mutating' when the method is mutating (the method wins).
  function _deriveMethod(entry) {
    if (entry) {
      if (entry.recipe && typeof entry.recipe.method === 'string' && entry.recipe.method) {
        return entry.recipe.method.toUpperCase();
      }
      if (typeof entry.method === 'string' && entry.method) {
        return entry.method.toUpperCase();
      }
      if (entry.descriptor && typeof entry.descriptor.method === 'string' && entry.descriptor.method) {
        return entry.descriptor.method.toUpperCase();
      }
    }
    return 'GET';
  }

  function _deriveSideEffectClass(entry, method) {
    var declared = '';
    if (entry) {
      if (typeof entry.sideEffectClass === 'string' && entry.sideEffectClass) {
        declared = entry.sideEffectClass;
      } else if (entry.descriptor && typeof entry.descriptor.sideEffectClass === 'string' && entry.descriptor.sideEffectClass) {
        declared = entry.descriptor.sideEffectClass;
      } else if (entry.handler && typeof entry.handler.sideEffectClass === 'string' && entry.handler.sideEffectClass) {
        declared = entry.handler.sideEffectClass;
      }
    }
    // The method is authoritative: a mutating verb is mutating even if a
    // descriptor under-declared it 'read'.
    if (method && MUTATING_METHODS[method]) { return 'mutating'; }
    return declared || 'read';
  }

  function _isMutatingSideEffect(sideEffectClass) {
    var c = (typeof sideEffectClass === 'string') ? sideEffectClass.toLowerCase() : '';
    return c === 'mutating' || c === 'mutate' || c === 'write' || c === 'destructive';
  }

  // ---- Best-effort audit append (D-09/D-10) --------------------------------
  //      Every invoke outcome -- blocked or allowed -- appends ONE redacted,
  //      field-whitelisted entry. The audit log itself owns the redaction; the
  //      router only assembles the whitelisted fields. A missing audit log or a
  //      throwing append NEVER affects the invoke return.
  function _audit(origin, slug, method, sideEffectClass, consentDecision, outcome, errorCode) {
    var log = _auditLog();
    if (!log || typeof log.append !== 'function') { return; }
    var record = {
      ts: Date.now(),
      origin: origin,
      slug: slug,
      method: method,
      sideEffectClass: sideEffectClass,
      consentDecision: consentDecision,
      outcome: outcome
    };
    if (errorCode) { record.error = errorCode; }
    try {
      var p = log.append(record);
      if (p && typeof p.catch === 'function') {
        p.catch(function() { /* best-effort; auditing must not poison invoke */ });
      }
    } catch (_e) { /* best-effort */ }
  }

  // ---- The consent gate (D-01..D-04, D-14, D-15; opt-out / "fully open") -----
  //      evaluate({ origin, slug, method, entry }) -> a decision object.
  //      Decision order:
  //        (1) denylist isDenied        -> 'blocked'   RECIPE_CONSENT_BLOCKED
  //        (2) mode 'off'               -> 'off'       RECIPE_CONSENT_REQUIRED
  //            (origin null / store absent-but-engaged also fails closed here)
  //        (3) mode 'ask'               -> 'ask'       RECIPE_CONSENT_REQUIRED
  //        (4) otherwise (mode 'auto')  -> 'allow'
  //      OPT-OUT posture: the shipped global default is 'auto', so an unseen origin
  //      is allowed. The former sensitive-downgrade (GOV-07/D-14) and mutating-
  //      elevation (GOV-03/D-04) gates are NO LONGER applied under 'auto' -- auto
  //      authorizes reads, writes, and sensitive (non-denied) origins alike. The
  //      denylist (1) is the only hard block; off/ask (2)/(3) are the per-origin
  //      (or global) opt-out paths. The network-capture DISCOVERY gate keeps its
  //      own sensitive-confirm, since live traffic sniffing is a broader grant.
  //      The error objects are dual-field RECIPE_* (the _err helper) so they
  //      surface verbatim through the /^RECIPE_.+$/ passthrough.
  //
  //      Degradation: when the consent store module is NOT loaded (the Phase-29
  //      router unit harness), the gate returns 'allow' so the legacy dispatch
  //      contract holds. Once the store is loaded, the global default is enforced.
  async function _evaluateConsent(params) {
    var p = params || {};
    var origin = p.origin;
    var slug = p.slug;
    var entry = p.entry;
    var method = (typeof p.method === 'string' && p.method) ? p.method.toUpperCase() : _deriveMethod(entry);
    var sideEffectClass = _deriveSideEffectClass(entry, method);
    var mutating = _isMutatingSideEffect(sideEffectClass) || !!MUTATING_METHODS[method];

    var denylist = _denylist();
    if (denylist) {
      var denylistReady = await _ensureDenylistReady(denylist);
      if (!denylistReady) {
        return {
          decision: 'off',
          method: method,
          sideEffectClass: sideEffectClass,
          error: _err('RECIPE_CONSENT_REQUIRED', { origin: (typeof origin === 'string' && origin) ? origin : null, slug: slug, reason: 'denylist-unavailable' })
        };
      }
    }

    // (1) DENYLIST FIRST (D-15): a denied origin is blocked regardless of any
    //     stored policy. A null/absent denylist treats nothing as denied.
    if (denylist && typeof denylist.isDenied === 'function') {
      var deny = null;
      try { deny = denylist.isDenied(origin); } catch (_e) { deny = null; }
      if (deny && deny.denied === true) {
        return {
          decision: 'blocked',
          method: method,
          sideEffectClass: sideEffectClass,
          error: _err('RECIPE_CONSENT_BLOCKED', { origin: origin, slug: slug, reason: deny.reason })
        };
      }
    }

    var store = _consentStore();
    // Store absent / malformed. Two cases (ME-01):
    //   (a) the PURE Phase-29 harness -- NONE of the four Phase-30 security
    //       modules are present -> the gate is not engaged (legacy dispatch
    //       contract holds); allow.
    //   (b) a Phase-30 deployment where the store FAILED to load while a sibling
    //       module DID -> the gate is DEGRADED. A credential-replay gate must
    //       FAIL CLOSED here (block), never fall open, even when the denylist is
    //       also absent (the combined-absence fail-open this fixes).
    if (!store || typeof store.readPolicies !== 'function' || typeof store.getConsentForOrigin !== 'function') {
      if (_isPhase29HarnessNoSecurityModules()) {
        return { decision: 'allow', method: method, sideEffectClass: sideEffectClass };
      }
      return {
        decision: 'off',
        method: method,
        sideEffectClass: sideEffectClass,
        error: _err('RECIPE_CONSENT_REQUIRED', { origin: (typeof origin === 'string' && origin) ? origin : null, slug: slug, reason: 'consent-store-unavailable' })
      };
    }

    // Fail closed: a null/absent origin can never be authorized.
    if (typeof origin !== 'string' || !origin) {
      return {
        decision: 'off',
        method: method,
        sideEffectClass: sideEffectClass,
        error: _err('RECIPE_CONSENT_REQUIRED', { origin: origin || null, slug: slug })
      };
    }

    var envelope = null;
    try { envelope = await store.readPolicies(); } catch (_e) { envelope = null; }
    var consent = store.getConsentForOrigin(envelope, origin);
    var mode = (consent && typeof consent.mode === 'string') ? consent.mode : 'off';
    var mutatingAllowed = !!(consent && consent.mutating);

    // (2) mode 'off' (per-origin opt-out, or a reverted global default) -> required.
    if (mode === 'off') {
      return {
        decision: 'off',
        method: method,
        sideEffectClass: sideEffectClass,
        error: _err('RECIPE_CONSENT_REQUIRED', { origin: origin, slug: slug })
      };
    }

    // (3) mode 'ask' -> consent required out-of-band (D-03; no synchronous modal).
    if (mode === 'ask') {
      return {
        decision: 'ask',
        method: method,
        sideEffectClass: sideEffectClass,
        error: _err('RECIPE_CONSENT_REQUIRED', { origin: origin, slug: slug })
      };
    }

    // (3.5) DENY-04 (posture B): a WRITE (mutating side-effect) to a SENSITIVE
    //       (non-denied) origin re-enforces the per-origin mutating opt-in.
    //       Reads pass under Auto everywhere; non-sensitive writes pass; only a
    //       sensitive write WITHOUT the per-origin mutating flag is re-gated.
    //       This NARROWS the "fully open under Auto" base committed in 68ceea90
    //       to sensitive origins only -- the deliberate posture-B refinement; it
    //       does NOT revert the opt-out posture. classify(origin).sensitive (the
    //       D-14 single source of truth) is consulted here via the already-
    //       resolved `denylist` accessor; `mutating` / `mutatingAllowed` are the
    //       values already computed above. Denied origins are blocked at step (1),
    //       so this branch only ever sees sensitive-but-not-denied origins.
    //
    //       FAIL CLOSED on a probe failure (MD-01): if the denylist IS present
    //       but classify() THROWS -- or returns a malformed (non-object) verdict
    //       -- the sensitivity is UNKNOWN. An unknown sensitivity on a MUTATING
    //       call must NOT fall through to allow (that is the one wrong answer): a
    //       credential-replay gate fails CLOSED on every other degradation
    //       (denylist-unavailable, consent-store-degraded, null-origin all return
    //       a typed reason above), so re-gate here too. An ABSENT denylist
    //       (no module / no classify fn) is the documented "nothing sensitive"
    //       baseline (see the degradation note above) -- it is NOT a degraded
    //       probe, so the write stays open. Reads / non-sensitive writes never
    //       reach this return.
    if (mutating && !mutatingAllowed) {
      var cls = null;
      var clsProbed = false;
      var clsErrored = false;
      if (denylist && typeof denylist.classify === 'function') {
        clsProbed = true;
        try { cls = denylist.classify(origin); }
        catch (_e) { cls = null; clsErrored = true; }
      }
      // A probe that ran but threw, or ran but returned a non-object, cannot
      // prove the origin is safe -> treat as potentially-sensitive (fail closed).
      var clsUnknown = clsProbed && (clsErrored || !cls || typeof cls !== 'object');
      if (clsUnknown || (cls && cls.sensitive === true)) {
        return {
          decision: 'mutating_required',
          method: method,
          sideEffectClass: sideEffectClass,
          error: _err('RECIPE_CONSENT_MUTATING_REQUIRED', { origin: origin, slug: slug })
        };
      }
    }

    // From here mode === 'auto'. Under the OPT-OUT ("fully open") posture, auto
    // authorizes reads everywhere AND writes to NON-sensitive origins. The denylist
    // (step 1) remains the ONLY hard block; the off/ask opt-out paths (steps 2/3)
    // are preserved so a per-origin Off -- or reverting the global default to
    // Off/Ask -- still gates. The former sensitive-downgrade (GOV-07/D-14) gate is
    // intentionally NOT applied under auto (sensitive reads run freely). The
    // mutating-elevation (GOV-03/D-04) gate is re-applied ONLY for sensitive-origin
    // writes by step (3.5) above (DENY-04 / posture B); `mutating` /
    // `mutatingAllowed` are consulted there. A non-sensitive write reaches this
    // line and is allowed. The network-capture DISCOVERY gate keeps its own
    // sensitive-confirm, since live traffic sniffing is a broader grant.
    return { decision: 'allow', method: method, sideEffectClass: sideEffectClass };
  }

  // The gate object this module owns. Published to the SW global below so both
  // front doors (and the consent/mutation tests) reach the ONE gate. A spy
  // pre-installed on global.FsbConsentGate (the chokepoint test injects one
  // BEFORE require) is PRESERVED -- the router does not clobber an injected gate.
  var _ownGate = { evaluate: _evaluateConsent };

  // Read the LIVE gate off the global at call time so an injected spy is honored
  // (the chokepoint test asserts its spy is the gate invoke reaches). Falls back
  // to this module's own gate when the global is somehow absent.
  function _gate() {
    var g = (typeof global !== 'undefined' && global && global.FsbConsentGate) ? global.FsbConsentGate : null;
    if (g && typeof g.evaluate === 'function') { return g; }
    return _ownGate;
  }

  // ---- The lifted T1b/T0 body (mcp-tool-dispatcher.js:2202-2220, verbatim) -------
  //
  // getRecipeBySlug (or the entry's authored recipe) -> interpretRecipe -> the
  // MAIN-world primitive executeBoundSpec. Direct refs swapped for typeof-guarded
  // globals (D-03). On a structured hit the normalized result is stamped with the
  // tier label ('T0' or 'T1b'); a typed RECIPE_* interpret/pin failure is returned
  // VERBATIM (no stamp) so the dual-field shape passes through unchanged.
  async function _runDeclarativeTier(slug, args, ctx, tierLabel, entryRecipe, interpretOpts) {
    var search = _search();
    var interp = _interp();
    var primitive = _fetchPrimitive();
    if (!interp || typeof interp.interpretRecipe !== 'function'
        || !primitive || typeof primitive.executeBoundSpec !== 'function') {
      return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'capability-engine-unavailable' });
    }

    // Recipe source: the entry's authored recipe first, then the live search
    // slug->recipe map (D-04). A missing recipe is an unknown slug.
    var recipe = entryRecipe
      || (search && typeof search.getRecipeBySlug === 'function' ? search.getRecipeBySlug(slug) : null)
      || null;
    if (!recipe) {
      return _err('RECIPE_NOT_FOUND', { slug: slug });
    }

    // Validate + bind (the interpreter re-asserts the recipe-self-consistency pin
    // and returns a typed RECIPE_* on any failure). A typed { success:false, ... }
    // is returned VERBATIM so its dual-field shape survives the /^RECIPE_.+$/
    // passthrough. A FALSY/non-object interpret result, however, must NOT be
    // propagated as-is: dispatchMcpMessageRoute computes success as
    // !(response && typeof response === 'object' && response.success === false)
    // (mcp-tool-dispatcher.js), so an undefined/null result would be read as a
    // SPURIOUS empty success (LOW-01). Fail closed with a typed RECIPE_NOT_FOUND
    // instead. The Phase-26 interpreter always returns a typed object today, so this
    // is a latent guardrail -- the router already branched on `!interpreted`, so it
    // must fail closed there rather than return the falsy value.
    // interpretRecipe is async as of Phase 30 (the signature-verify hook is
    // async). The Phase-29 head (T0/T1b) passes NO interpretOpts -- entryRecipe is
    // the unwrapped recipe core and interpretOpts is undefined -- so it stays on
    // the exempt no-meta default path (no verify call), BYTE-IDENTICAL to before;
    // awaiting an async result is the only change there. The Phase-31 T2 learned
    // path threads interpretOpts = { trustedProvenance: 'local' } (the LOADER's
    // vouch, HI-01): the interpreter short-circuits to the synchronous bind for a
    // 'local' provenance exactly as it does for 'bundled', so the learned recipe
    // replays through the SAME validate-bind path without a self-declared trust.
    var interpreted = await interp.interpretRecipe(recipe, args || {}, interpretOpts);
    if (!interpreted) {
      return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'interpret-returned-empty' });
    }
    if (interpreted.success !== true) {
      return interpreted;   // already a typed RECIPE_* dual-field object
    }

    // The credentialed execution primitive re-asserts the ACTIVE-TAB origin-pin
    // BEFORE any side effect (the second pin point). The router passes the resolved
    // tabId through unchanged -- it never re-targets.
    var out = await primitive.executeBoundSpec(interpreted.spec, ctx && ctx.tabId);

    // ---- HEAL-01/HEAL-04 post-fetch rot classify hook (D-01/D-16) ------------
    // Classify the executeBoundSpec result BEFORE the success-stamp. The detector
    // distinguishes a real rot (4xx/5xx, fetch-failed, expectedShape-mismatch) from
    // a legitimate no-results (returned VERBATIM, never masked -- HEAL-04) and from
    // a logged-out / typed-security passthrough (surfaced, NOT healed -- Pitfall 3).
    // Only a broken:true verdict quarantines + emits the dual-field
    // RECIPE_DOM_FALLBACK_PENDING carrying the underlying code so both front doors
    // surface it. A non-broken verdict falls through to the existing stamp+return
    // UNCHANGED. A MISSING detector (the Phase-29 head) skips the hook entirely, so
    // the success path below is byte-identical to before.
    var detector = _rotDetector();
    if (detector && typeof detector.classifyRecipeBroken === 'function') {
      var verdict = detector.classifyRecipeBroken(out, recipe);
      if (verdict && verdict.broken === true) {
        // Best-effort demotion + opportunistic consent-gated re-learn (fire-and-forget).
        _quarantineAndRelearn(slug, tierLabel, ctx && ctx.origin, ctx && ctx.tabId);
        // Emit the typed "fall back to DOM" reason carrying the underlying code (e.g.
        // RECIPE_EXPIRED / RECIPE_HTTP_4XX) in `reason`, plus the fellBackToDom marker
        // (D-04) the autopilot door surfaces verbatim. The completion is model-driven
        // (the model selects the DOM tools next iteration) -- the router NEVER runs a
        // parallel stack (INV-02) and NEVER calls executeTool.
        return _err('RECIPE_DOM_FALLBACK_PENDING', {
          slug: slug,
          reason: verdict.code,
          recipeBrokenReason: verdict.reason,
          fellBackToDom: true
        });
      }
    }

    if (out && out.success === true) {
      // Stamp the tier on the normalized hit shape. A legitimate no-results (200 +
      // valid shape + empty set) and a logged-out (redirected:true) both reach HERE
      // (the detector classified them NOT broken) and return their REAL/typed result.
      out.tier = tierLabel;
      return out;
    }
    // A typed primitive failure (e.g. RECIPE_ORIGIN_MISMATCH) -> verbatim dual-field.
    return out;
  }

  // ---- The T1a bundled-head body -------------------------------------------
  //
  // Dispatch to the registered handler's handle(args, ctx). The handler builds its
  // own bound spec(s) and MUST call ctx.executeBoundSpec for the actual credentialed
  // request -- so the active-tab origin-pin holds on the head path too (D-12). The
  // router supplies the execution + interpret primitives in ctx; it never injects
  // into a page itself. On a structured hit the result is stamped tier:'T1a'; a
  // typed handler failure (incl. the pin's RECIPE_ORIGIN_MISMATCH) is returned
  // verbatim.
  async function _runHandlerTier(slug, args, ctx, entry) {
    var handler = entry && entry.handler;
    if (!handler || typeof handler.handle !== 'function') {
      return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'handler-unavailable' });
    }
    var paramError = _validateHandlerParams(entry, args);
    if (paramError) { return paramError; }
    var primitive = _fetchPrimitive();
    var interp = _interp();
    var handlerCtx = {
      origin: ctx && ctx.origin,
      tabId: ctx && ctx.tabId,
      url: ctx && ctx.url,
      executeBoundSpec: primitive ? primitive.executeBoundSpec : undefined,
      executeBoundPageRead: primitive ? primitive.executeBoundPageRead : undefined,
      interpretRecipe: interp ? interp.interpretRecipe : undefined,
      googleSheets: _googleSheetsContext()
    };
    var out = await handler.handle(args || {}, handlerCtx);

    // ---- HEAL-01/HEAL-04 post-fetch rot classify hook on the T1a head path ----
    // The same classify hook as the declarative tier, but with a WEAKER rot signal by
    // design (WR-02). A T1a entry is an IMPERATIVE bundled head handler
    // (catalog/handlers/*.js: github.issues.* / slack.* / notion.*) that builds its
    // own bound spec(s) internally -- it carries NO declarative recipe and therefore
    // NO expectedShape: catalog.resolve() returns { tier, handler, origin, descriptor }
    // for a T1a (capability-catalog.js:336-344) and registerHandler never stores a
    // recipe, so `entry.recipe` is ALWAYS null here. (The github.notifications /
    // reddit.inbox recipes are the DISTINCT T1b slugs, not these.) Consequently the
    // expectedShape row of classifyRecipeBroken is intentionally NOT exercised on the
    // head path; head-tier rot is detected ONLY via the status / redirect /
    // fetch-failed rows (a 4xx/5xx, a 302->login, or a fetch/executeScript failure). A
    // T1a endpoint that rots to a 200-with-wrong-shape body is NOT caught here -- it
    // surfaces on the next break -- which is the safe direction (under-detect, never
    // mis-heal). A T1a is a BUNDLED slug, so a broken verdict quarantines via the
    // catalog (session-only). The handler's OWN typed RECIPE_* security error (e.g.
    // the pin's RECIPE_ORIGIN_MISMATCH) classifies as NOT broken (typed-passthrough)
    // and is returned verbatim below -- never healed (Pitfall 3).
    var detectorH = _rotDetector();
    if (detectorH && typeof detectorH.classifyRecipeBroken === 'function') {
      // Always null for a T1a entry (see the contract note above); passed for shape
      // parity with the declarative tier's classify call, not because a recipe exists.
      var recipeH = (entry && entry.recipe) ? entry.recipe : null;
      var verdictH = detectorH.classifyRecipeBroken(out, recipeH);
      if (verdictH && verdictH.broken === true) {
        _quarantineAndRelearn(slug, 'T1a', ctx && ctx.origin, ctx && ctx.tabId);
        return _err('RECIPE_DOM_FALLBACK_PENDING', {
          slug: slug,
          reason: verdictH.code,
          recipeBrokenReason: verdictH.reason,
          fellBackToDom: true
        });
      }
    }

    if (out && out.success === true) {
      out.tier = 'T1a';
      return out;
    }
    // Handler's own typed error (e.g. the pin's RECIPE_ORIGIN_MISMATCH) -> verbatim.
    return out;
  }

  // ---- invoke(slug, args, ctx) -- the single SW-global entry (D-02) -------------
  //
  // ctx = { origin, tabId, source? }. origin is resolved authoritatively SW-side by
  // the front-door handler (Plan 03/04); the router treats it as the bias input to
  // the catalog only. Returns the dual-field RECIPE_NOT_FOUND when no catalog entry
  // resolves.
  async function invoke(slug, args, ctx) {
    var c = ctx || {};
    var catalog = _catalog();

    // Resolve the catalog entry FIRST (it may be null when the catalog is
    // unavailable or the slug is unknown). The entry feeds the gate's side-effect
    // classification. We do NOT early-return on a null entry yet -- the consent
    // gate is the SINGLE chokepoint both front doors share (D-01/INV-02) and must
    // run on every invoke, even one that will ultimately miss the catalog.
    var entry = (catalog && typeof catalog.resolve === 'function') ? catalog.resolve(slug, c.origin) : null;
    var method = _deriveMethod(entry);

    // ---- CONSENT GATE (D-01..D-04, D-14, D-15) -- the one chokepoint ---------
    // Runs AFTER the upstream ownership gate (the front doors own ownership) and
    // BEFORE any tier dispatch. On a non-allow decision: append a blocked audit
    // entry and RETURN the dual-field RECIPE_CONSENT_* error VERBATIM. The gate
    // sits ABOVE executeBoundSpec -- the two-point origin-pin / INV-01 / INV-04
    // are untouched.
    var gate = _gate();
    var verdict = await gate.evaluate({ origin: c.origin, slug: slug, method: method, entry: entry });
    if (!verdict || verdict.decision !== 'allow') {
      var decisionLabel = (verdict && (verdict.consentDecision || verdict.decision)) || 'off';
      var gMethod = (verdict && verdict.method) || method;
      var gSec = (verdict && verdict.sideEffectClass) || _deriveSideEffectClass(entry, gMethod);
      var gErr = (verdict && verdict.error) ? verdict.error : _err('RECIPE_CONSENT_REQUIRED', { origin: c.origin || null, slug: slug });
      _audit(c.origin, slug, gMethod, gSec, decisionLabel, 'blocked', gErr.code);
      return gErr;
    }

    // Gate allowed -> now the catalog entry MUST exist to dispatch.
    if (!catalog || typeof catalog.resolve !== 'function') {
      _audit(c.origin, slug, method, _deriveSideEffectClass(entry, method), 'allow', 'error', 'RECIPE_NOT_FOUND');
      return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'catalog-unavailable' });
    }
    if (!entry) {
      _audit(c.origin, slug, method, _deriveSideEffectClass(entry, method), 'allow', 'error', 'RECIPE_NOT_FOUND');
      return _err('RECIPE_NOT_FOUND', { slug: slug });
    }

    var allowMethod = (verdict && verdict.method) || method;
    var allowSec = (verdict && verdict.sideEffectClass) || _deriveSideEffectClass(entry, allowMethod);
    var out;
    switch (entry.tier) {
      case 'T1a':
        out = await _runHandlerTier(slug, args, c, entry);
        break;

      case 'T0':
        out = await _runDeclarativeTier(slug, args, c, 'T0', entry.recipe);
        break;

      case 'T1b':
        out = await _runDeclarativeTier(slug, args, c, 'T1b', entry.recipe);
        break;

      case 'T2':
        // Learned-recipe tier (Phase 31, LEARN-04/D-15). When the catalog attached
        // a learned recipe (entry.recipe -- the per-origin store resolved one for
        // the active origin and it OUTRANKED a generic tier by resolve order),
        // DISPATCH it through the SAME declarative replay path as a bundled recipe,
        // threading { trustedProvenance: 'local' } as the LOADER's vouch (HI-01).
        // The consent gate above and the executeBoundSpec origin-pin downstream are
        // unchanged. When NO learned recipe is attached the RECIPE_LEARN_PENDING
        // stub still fires (no-op, no execution).
        // Phase 42 (DSEED-01, SC2): the no-learned-recipe leg now surfaces an
        // ACTIONABLE affordance instead of a silent no-op. The code stays the
        // byte-stable 'RECIPE_LEARN_PENDING' (INV-03: code===errorCode===error); the
        // { reason, actionable, message } fields are ADDITIVE (merged by _err). The
        // origin is derived from what the branch already has -- prefer the resolved
        // descriptor's origin, fall back to the active call origin `c.origin`; if
        // neither yields an origin, build the message WITHOUT the host (still present
        // + actionable). The T2-WITH-recipe dispatch leg is UNCHANGED.
        if (entry.recipe) {
          out = await _runDeclarativeTier(slug, args, c, 'T2', entry.recipe, { trustedProvenance: 'local' });
        } else {
          var learnOrigin = (entry.descriptor && entry.descriptor.origin) || c.origin || null;
          var learnMsg = learnOrigin
            ? ('Open ' + learnOrigin + ' while signed in so FSB can learn this capability from your own traffic.')
            : 'Open the site while signed in so FSB can learn this capability from your own traffic.';
          out = _err('RECIPE_LEARN_PENDING', {
            slug: slug,
            reason: 'not-yet-learned',
            actionable: true,
            message: learnMsg
          });
        }
        break;

      case 'T3':
        // DOM-fallback seam (Phase 32). Return the reason ONLY -- the router MUST
        // NOT run the next tier (no executeTool, no page injection) this phase.
        out = _err('RECIPE_DOM_FALLBACK_PENDING', { slug: slug });
        break;

      default:
        out = _err('RECIPE_NOT_FOUND', { slug: slug });
        break;
    }

    // Audit the dispatched outcome (D-09): 'ok' on a structured success, else
    // 'error' carrying the typed code (no body, no args -- the audit log itself
    // whitelists + redacts).
    var ok = !!(out && out.success === true);
    _audit(c.origin, slug, allowMethod, allowSec, 'allow', ok ? 'ok' : 'error', ok ? null : (out && out.code));
    return out;
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js:372-385) -
  var exportsObj = {
    invoke: invoke,
    FsbConsentGate: _ownGate   // exported so callers can reference the gate directly
  };

  global.FsbCapabilityRouter = exportsObj;   // SW importScripts consumer reads this global

  // Publish the consent gate to the SW global so both front doors (and the
  // chokepoint/gate/mutation tests) reach the ONE gate. Do NOT clobber an
  // already-injected gate (the chokepoint test installs a spy BEFORE require);
  // invoke reads global.FsbConsentGate at call time so the spy is honored.
  if (typeof global !== 'undefined' && global && !global.FsbConsentGate) {
    global.FsbConsentGate = _ownGate;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
