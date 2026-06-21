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
    // and returns a typed RECIPE_* on any failure). Returned verbatim.
    var interpreted = interp.interpretRecipe(recipe, args || {});
    if (!interpreted || interpreted.success !== true) {
      return interpreted;
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
    if (!catalog || typeof catalog.resolve !== 'function') {
      return _err('RECIPE_NOT_FOUND', { slug: slug, reason: 'catalog-unavailable' });
    }

    var entry = catalog.resolve(slug, c.origin);
    if (!entry) {
      return _err('RECIPE_NOT_FOUND', { slug: slug });
    }

    switch (entry.tier) {
      case 'T1a':
        return await _runHandlerTier(slug, args, c, entry);

      case 'T0':
        return await _runDeclarativeTier(slug, args, c, 'T0', entry.recipe);

      case 'T1b':
        return await _runDeclarativeTier(slug, args, c, 'T1b', entry.recipe);

      case 'T2':
        // Learned-recipe stub (Phase 31). No-op: return the reason, do NOT execute.
        return _err('RECIPE_LEARN_PENDING', { slug: slug });

      case 'T3':
        // DOM-fallback seam (Phase 32). Return the reason ONLY -- the router MUST
        // NOT run the next tier (no executeTool, no page injection) this phase.
        return _err('RECIPE_DOM_FALLBACK_PENDING', { slug: slug });

      default:
        return _err('RECIPE_NOT_FOUND', { slug: slug });
    }
  }

  // ---- Export shape (dual-export IIFE; mirror capability-interpreter.js:372-385) -
  var exportsObj = {
    invoke: invoke
  };

  global.FsbCapabilityRouter = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;             // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
