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

  // ---- The consent + sensitive + mutation gate (D-01..D-04, D-14, D-15) -----
  //      evaluate({ origin, slug, method, entry }) -> a decision object.
  //      LOCKED decision order (the BLOCKER fix -- sensitive BEFORE mutation, so a
  //      sensitive Auto origin can NEVER reach a mutation decision or allow
  //      without first being downgraded to ask):
  //        (1) denylist isDenied        -> 'blocked'   RECIPE_CONSENT_BLOCKED
  //        (2) default-OFF / mode 'off' -> 'off'       RECIPE_CONSENT_REQUIRED
  //            (origin null / store absent-but-engaged also fails closed here)
  //        (3) mode 'ask'               -> 'ask'       RECIPE_CONSENT_REQUIRED
  //        (4) sensitive AND mode 'auto'-> 'sensitive' RECIPE_CONSENT_REQUIRED
  //            (classify(origin).sensitive is the single source of truth, D-14;
  //             Auto is DOWNGRADED to ask AT THE GATE -- never silently executed)
  //        (5) mutating AND not opted-in-> 'mutating'  RECIPE_CONSENT_MUTATING_REQUIRED
  //        (6) otherwise                -> 'allow'
  //      The error objects are dual-field RECIPE_* (the _err helper) so they
  //      surface verbatim through the /^RECIPE_.+$/ passthrough.
  //
  //      Degradation: when the consent store module is NOT loaded (the Phase-29
  //      router unit harness), the gate returns 'allow' so the legacy dispatch
  //      contract holds. Once the store is loaded, default-OFF is enforced.
  async function _evaluateConsent(params) {
    var p = params || {};
    var origin = p.origin;
    var slug = p.slug;
    var entry = p.entry;
    var method = (typeof p.method === 'string' && p.method) ? p.method.toUpperCase() : _deriveMethod(entry);
    var sideEffectClass = _deriveSideEffectClass(entry, method);
    var mutating = (sideEffectClass === 'mutating') || !!MUTATING_METHODS[method];

    var denylist = _denylist();

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
    // Degrade: store module not loaded -> the gate is not engaged (Phase-29 head).
    if (!store || typeof store.readPolicies !== 'function' || typeof store.getConsentForOrigin !== 'function') {
      return { decision: 'allow', method: method, sideEffectClass: sideEffectClass };
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

    // (2) default-OFF / mode 'off' -> consent required (GOV-01).
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

    // From here mode === 'auto' (the only remaining valid mode).
    // (4) SENSITIVE + AUTO downgrade (GOV-07/D-14): classify is the single source
    //     of truth. A sensitive Auto origin is downgraded to ask BEFORE the
    //     mutation/allow steps so Auto never silently executes against it.
    if (denylist && typeof denylist.classify === 'function') {
      var klass = null;
      try { klass = denylist.classify(origin); } catch (_e) { klass = null; }
      if (klass && klass.sensitive === true) {
        return {
          decision: 'sensitive',
          consentDecision: 'sensitive',
          method: method,
          sideEffectClass: sideEffectClass,
          error: _err('RECIPE_CONSENT_REQUIRED', { origin: origin, slug: slug })
        };
      }
    }

    // (5) MUTATION (GOV-03/D-04): a mutating method on a non-elevated origin needs
    //     the SEPARATE mutating opt-in. read-Auto != write-Auto.
    if (mutating && !mutatingAllowed) {
      return {
        decision: 'mutating',
        method: method,
        sideEffectClass: sideEffectClass,
        error: _err('RECIPE_CONSENT_MUTATING_REQUIRED', { origin: origin, slug: slug })
      };
    }

    // (6) allow.
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
  async function _runDeclarativeTier(slug, args, ctx, tierLabel, entryRecipe) {
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
    // async). The Phase-29 head passes NO provenance envelope -- entryRecipe is
    // the unwrapped recipe core -- so it stays on the exempt no-meta default path
    // (no verify call); awaiting an async result is the only change here.
    var interpreted = await interp.interpretRecipe(recipe, args || {});
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
    if (out && out.success === true) {
      // Stamp the tier on the normalized hit shape.
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
    var primitive = _fetchPrimitive();
    var interp = _interp();
    var handlerCtx = {
      origin: ctx && ctx.origin,
      tabId: ctx && ctx.tabId,
      executeBoundSpec: primitive ? primitive.executeBoundSpec : undefined,
      interpretRecipe: interp ? interp.interpretRecipe : undefined
    };
    var out = await handler.handle(args || {}, handlerCtx);
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
        // Learned-recipe stub (Phase 31). No-op: return the reason, do NOT execute.
        out = _err('RECIPE_LEARN_PENDING', { slug: slug });
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
