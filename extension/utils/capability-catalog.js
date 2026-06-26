(function(global) {
  'use strict';

  /**
   * Phase 29 Plan 02 (v0.9.99 Native Capability Catalog) -- capability-catalog.js
   *
   * The authoritative per-slug TIER registry (CAT-01, CAT-03, D-01/D-04). Owns the
   * slug -> { tier, handler|recipe, descriptor } map that drives invoke_capability
   * tier routing in capability-router.js. A slug is EITHER T1a OR T1b -- the tier is
   * declared EXPLICITLY here, never inferred at runtime (RESEARCH Open Q3): origin
   * biases candidate RANKING only, never the tier of a known slug.
   *
   * Module shell: the dual-export IIFE mirror of capability-search.js /
   * capability-interpreter.js -- the service worker reads global.FsbCapabilityCatalog
   * after importScripts; Node tests require() the module.exports. Vendored / sibling
   * globals (FsbCapabilitySearch) are reached only through a typeof-guarded accessor
   * so the module loads cleanly under the Node test harness (the global may be absent
   * -> degrade to a null recipe, never throw).
   *
   * Locked decisions implemented here (29-CONTEXT.md):
   *   - D-01 NEW dual-export SW module on RECIPE_PATH_ALLOWLIST; free of dynamic-code
   *          constructs even in comments -- Check 4 fails CI closed on any
   *          extension/utils/capability-*.js carrying them (Wall-1).
   *   - D-04 the Phase-28 capability-search slug->recipe map (getRecipeBySlug:222)
   *          remains the T1b recipe source; a T1b/T0 entry sources its recipe via a
   *          typeof-guarded _search() accessor, with an authored inline recipe as a
   *          best-effort fallback so the tier resolves even when the search index is
   *          not yet built (dev tree / unit harness).
   *   - D-05/D-06 T0 is a no-auth declarative special-case (a recipe with
   *          authStrategy 'none'), NOT separate infra -- it shares the T1b recipe
   *          path and is routed by its explicit tier.
   *   - github.notifications is seeded as the T1b head (the one proven recipe pair,
   *          catalog/recipes/github-notifications.json + descriptor).
   *
   * Plan 03 mechanism: T1a (bundled imperative head) handler modules register their
   * slug -> handler entry at load via registerHandler(slug, entry) (see below). This
   * keeps the registry DECLARATIVE -- the catalog never imports a handler; each
   * handler module pushes itself in after the catalog loads. resolve() returns the
   * registered T1a entry stamped tier:'T1a' regardless of origin.
   *
   * The router routes; the catalog never re-targets. No chrome.*, no network here.
   *
   * NO EMOJIS, ASCII-only source.
   */

  // ---- typeof-guarded sibling-global accessor (mirror capability-search.js:57-69)
  //      The T1b recipe source (D-04). Absent under the Node unit harness when the
  //      search module is not loaded -> degrade to a null recipe (the router falls
  //      back to the entry's authored inline recipe).
  function _search() {
    return (typeof FsbCapabilitySearch !== 'undefined' && FsbCapabilitySearch) ? FsbCapabilitySearch : null;
  }

  function _getRecipeBySlug(slug) {
    var s = _search();
    if (s && typeof s.getRecipeBySlug === 'function') {
      try { return s.getRecipeBySlug(slug) || null; } catch (e) { return null; }
    }
    return null;
  }

  // ---- CGEN-03 / Decision B: typeof-guarded descriptor accessor --------------
  //      Mirrors _search()/_getRecipeBySlug above. The SEARCHABLE descriptor set
  //      lives on the build-time generated FsbRecipeIndex global (recipe-index.
  //      generated.js: { recipes:[...], descriptors:[...] }) -- the SAME array
  //      capability-search.js indexes. resolve()'s no-dead-entry fallback reads it
  //      DIRECTLY (Option A: capability-search.js exports no getDescriptorBySlug, so
  //      a direct read keeps the load-bearing change to ONE file). Absent global /
  //      absent array under the Node unit harness -> null (resolve falls through to
  //      the genuinely-unknown -> null leg, the correct RECIPE_NOT_FOUND).
  function _recipeIndex() {
    return (typeof FsbRecipeIndex !== 'undefined' && FsbRecipeIndex) ? FsbRecipeIndex : null;
  }

  function _getDescriptor(slug) {
    var idx = _recipeIndex();
    if (!idx || !Array.isArray(idx.descriptors)) { return null; }
    // Linear scan is fine at smoke scale; at full scale (Phase 43) memoize a
    // slug->descriptor map ONCE (the descriptors array is static post-load) to stay
    // O(1). No chrome.*, no network -- a pure in-memory read.
    for (var i = 0; i < idx.descriptors.length; i++) {
      var d = idx.descriptors[i];
      if (d && d.slug === slug) { return d; }
    }
    return null;
  }

  // ---- LEARN-04 / D-15: typeof-guarded learned-store accessor ----------------
  //      Parallel to _search(). The Phase-31 per-origin learned-recipe store
  //      (FsbLearnedRecipeStore) surfaces the highest-trust per-origin recipe.
  //      resolve() is SYNCHRONOUS (the router calls it synchronously and reads the
  //      returned recipe immediately), so this accessor uses the store's
  //      SYNCHRONOUS getLearnedSync(slug, origin) -- a learned recipe cannot be
  //      surfaced via the async getLearned() inside a synchronous resolve. The
  //      store keeps the sync mirror in memory; the async getLearned() remains the
  //      storage-truth read used elsewhere. Absent store / absent sync accessor ->
  //      null (resolve falls through to the REGISTRY, the Phase-29 behavior). The
  //      hard origin scope (recipe.origin === origin, Pitfall 6) lives IN the store.
  function _learnedStore() {
    return (typeof FsbLearnedRecipeStore !== 'undefined' && FsbLearnedRecipeStore) ? FsbLearnedRecipeStore : null;
  }

  function _getLearned(slug, origin) {
    var store = _learnedStore();
    if (!store || typeof store.getLearnedSync !== 'function') { return null; }
    try {
      var hit = store.getLearnedSync(slug, origin);
      return (hit && hit.recipe) ? hit : null;
    } catch (e) {
      return null;
    }
  }

  // ---- HEAL-03 / D-09 / D-12: session-only bundled-recipe quarantine ---------
  //
  // A null-prototype map used as a Set of bundled slugs the router has demoted
  // this SESSION after classifyRecipeBroken deemed a bundled (T0/T1b/T1a) result
  // broken. resolve() consults it and SKIPS a quarantined bundled slug (returns
  // null -> the router falls through to the next tier / the DOM fallback, D-11).
  //
  // Deliberately session-only + in-memory (D-12): a transient first-party blip
  // (a one-off 500) must NOT permanently demote a shipped bundled recipe -- the
  // Set is re-evaluated next SW session (it is NEVER persisted). It is a SEPARATE
  // structure: the REGISTRY data is NEVER mutated (D-09, Pitfall 4). A null-proto
  // map avoids prototype-key collisions (no inherited keys appear as "quarantined").
  var quarantinedBundledSlugs = Object.create(null);

  // Flag a bundled slug as quarantined for this session. String-guards the slug
  // (a non-string is a no-op). Does NOT persist and does NOT touch the REGISTRY.
  function quarantineBundled(slug) {
    if (typeof slug !== 'string' || !slug) { return false; }
    quarantinedBundledSlugs[slug] = true;
    return true;
  }

  // Clear a bundled slug's session quarantine (e.g. after a successful re-review /
  // re-learn). A no-op for an unknown / non-string slug.
  function clearBundledQuarantine(slug) {
    if (typeof slug !== 'string' || !slug) { return false; }
    if (Object.prototype.hasOwnProperty.call(quarantinedBundledSlugs, slug)) {
      delete quarantinedBundledSlugs[slug];
      return true;
    }
    return false;
  }

  // ---- T1b/T0 declarative seed recipes -------------------------------------
  //
  // The authoritative recipe source at runtime is the search slug->recipe map
  // (D-04). These inline copies mirror catalog/recipes/*.json verbatim and serve as
  // a best-effort fallback so a T1b/T0 slug resolves its tier (and a usable recipe)
  // even before the search index is built -- the router prefers entry.recipe and
  // only then _search().getRecipeBySlug(slug). Keep these byte-identical to the
  // shipped JSON recipe of the same id.
  var GITHUB_NOTIFICATIONS_RECIPE = {
    schemaVersion: 1,
    id: 'github.notifications',
    origin: 'https://github.com',
    endpoint: '/notifications',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };

  // Reddit unread inbox -- a second T1b recipe (Plan 03, CAT-03). A single same-origin
  // GET the declarative schema expresses; mirrors catalog/recipes/reddit-inbox.json
  // verbatim. The first-party origin is www.reddit.com -- the API on oauth.reddit.com
  // is a SEPARATE origin and is NOT used (the session cookie does not cross to it).
  var REDDIT_INBOX_RECIPE = {
    schemaVersion: 1,
    id: 'reddit.inbox',
    origin: 'https://www.reddit.com',
    endpoint: '/message/unread.json',
    method: 'GET',
    authStrategy: 'same-origin-cookie',
    extract: '@'
  };

  // ---- The authoritative per-slug TIER registry (the declarative long tail) ----
  //
  // Each entry declares the slug's EXPLICIT authoritative tier:
  //   - T0  : no-auth declarative special-case (recipe with authStrategy 'none')
  //   - T1a : bundled imperative head -- a handler registered by a Plan-03 module
  //   - T1b : declarative recipe bound by the interpreter (the long tail)
  //   - T2  : learned-recipe stub (Phase 31; router returns RECIPE_LEARN_PENDING)
  //   - T3  : DOM-fallback seam (Phase 32; router returns RECIPE_DOM_FALLBACK_PENDING)
  // A slug is EITHER T1a OR T1b -- no runtime tie-break. For a T1b/T0 entry the
  // recipe is attached for the router's lifted body; for a T1a entry a handler is
  // attached (seeded by registerHandler at load). descriptor is optional metadata.
  var REGISTRY = {
    'github.notifications': {
      tier: 'T1b',
      recipe: GITHUB_NOTIFICATIONS_RECIPE,
      descriptor: { slug: 'github.notifications', service: 'github.com', sideEffectClass: 'read' }
    },
    'reddit.inbox': {
      tier: 'T1b',
      recipe: REDDIT_INBOX_RECIPE,
      descriptor: { slug: 'reddit.inbox', service: 'www.reddit.com', sideEffectClass: 'read' }
    }
  };

  // ---- Plan 03 T1a handler registration mechanism --------------------------
  //
  // A bundled head handler module (catalog/handlers/*.js, Plan 03) registers its
  // slug -> entry here at load -- AFTER this catalog module loads (background.js
  // importScripts order). The entry MUST declare tier:'T1a' and carry the handler
  // object the router invokes (handler.handle(args, ctx)). This keeps the catalog
  // declarative: it never imports a handler; each handler pushes itself in. A slug
  // already declared T1b cannot be silently re-tiered to T1a -- registering an
  // existing slug overwrites only an entry of the same (or absent) tier intent;
  // callers own slug uniqueness (a slug is EITHER T1a OR T1b, D-04).
  function registerHandler(slug, entry) {
    if (!slug || !entry) return false;
    var tier = entry.tier || 'T1a';
    REGISTRY[slug] = {
      tier: tier,
      handler: entry.handler || entry,
      origin: entry.origin || null,
      params: entry.params || (entry.handler && entry.handler.params) || null,
      descriptor: entry.descriptor || null
    };
    return true;
  }

  // ---- Plan 03 EXPLICIT bundled-head declaration (CAT-02) -------------------
  //
  // The authoritative, declarative manifest of which T1a head slugs the catalog
  // ships, keyed by the handler module's SW global. Each handler module
  // (catalog/handlers/*.js) exposes a slug-keyed object on its global and ALSO
  // self-registers at load (defense-in-depth). This manifest is the catalog-side
  // EXPLICIT declaration the head is built against: seedHeadHandlers() walks it,
  // reads each present global typeof-guarded, and registers every slug as tier:'T1a'
  // -- so the head is declared HERE (the authoritative registry) even though the
  // handler CODE lives in the bundle, never imported by this pure module. A handler
  // global absent at call time (dev tree / unit harness) is skipped silently; the
  // shipped SW calls this after the handler importScripts run (background.js).
  //
  // A slug is EITHER T1a OR T1b: github.notifications stays the T1b recipe seed
  // above; the github.issues.* slugs are the T1a head -- distinct slugs, no tie-break.
  var HEAD_HANDLER_MODULES = [
    { global: 'FsbHandlerGithub', service: 'github.com', origin: 'https://github.com' },
    { global: 'FsbHandlerSlack', service: 'app.slack.com', origin: 'https://app.slack.com' },
    { global: 'FsbHandlerNotion', service: 'www.notion.so', origin: 'https://www.notion.so' },
    // Phase 40 (DEPTH-01): the GitLab READ head -- 5 same-origin gitlab.com/api/v4
    // reads, the same-origin replacement for the deferred linear (40-01 decision_note).
    // 4th module, <=30. seedHeadHandlers() seeds its slugs from this manifest
    // (defense-in-depth alongside the module self-register).
    { global: 'FsbHandlerGitlab', service: 'gitlab.com', origin: 'https://gitlab.com' }
  ];

  function _readGlobal(name) {
    try {
      return (typeof global !== 'undefined' && global && global[name]) ? global[name] : null;
    } catch (e) {
      return null;
    }
  }

  // Register every slug exposed by each PRESENT head-handler global as tier:'T1a'.
  // Idempotent: re-registering the same slug overwrites with the same entry. Returns
  // the count of slugs registered. No chrome.*, no network -- a pure registry seed.
  function seedHeadHandlers() {
    var count = 0;
    for (var i = 0; i < HEAD_HANDLER_MODULES.length; i++) {
      var mod = HEAD_HANDLER_MODULES[i];
      var obj = _readGlobal(mod.global);
      if (!obj || typeof obj !== 'object') { continue; }
      for (var slug in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, slug)) { continue; }
        var entry = obj[slug];
        if (!entry || typeof entry.handle !== 'function') { continue; }
        registerHandler(slug, {
          tier: 'T1a',
          handler: entry,
          origin: entry.origin || mod.origin,
          params: entry.params || null,
          descriptor: { slug: slug, service: mod.service, sideEffectClass: entry.sideEffectClass || 'read', params: entry.params || null }
        });
        count++;
      }
    }
    return count;
  }

  // ---- Origin-bias helper (mirror capability-search.js:209-219) ------------
  //
  // Reusable owned-origin-first re-rank for candidate entries that share a slug
  // class (CAT-01 "biased by tab origin"). Stable: owned-origin entries first,
  // original relative order preserved within each bucket. This re-ranks WHICH
  // candidate is chosen; it NEVER changes the tier of a known slug (RESEARCH Open
  // Q3). The in-memory catalog stub in capability-router.test.js drives the bias
  // selection itself; this helper is the shipped equivalent the SW catalog uses
  // when an authored slug carries multiple same-class candidates.
  function biasByOwnedOrigin(candidates, origin) {
    if (!Array.isArray(candidates)) return candidates || null;
    var owned = [];
    var rest = [];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      var o = c && c.origin;
      if (o && origin && o === origin) { owned.push(c); }
      else { rest.push(c); }
    }
    var ranked = owned.concat(rest);
    return ranked.length ? ranked[0] : null;
  }

  // ---- resolve(slug, origin) -> { tier, handler|recipe, descriptor } | null ----
  //
  // The authoritative tier lookup. Returns null for an unknown slug. Origin biases
  // candidate ranking only (when an entry is an array of same-class candidates); it
  // never changes a known slug's tier. For a T1b/T0 entry the recipe is the authored
  // inline copy when present, else the live search map (D-04). For a T1a entry the
  // registered handler is returned as-is.
  function resolve(slug, origin) {
    // LEARN-04 / D-15 (Option A): the learned store is checked FIRST. A learned
    // recipe for the ACTIVE origin resolves as a T2 tier with the recipe attached,
    // so it OUTRANKS a generic T1b for the SAME slug by resolve order -- no router
    // tie-break. The store hard-scopes by origin (recipe.origin === origin,
    // Pitfall 6), so a cross-origin learned recipe is never surfaced here. When no
    // learned recipe exists the lookup falls through to the REGISTRY below (an
    // explicitly-declared T2 slug with no learned recipe still returns the
    // verbatim-tier stub shape -> the router's RECIPE_LEARN_PENDING).
    var learned = _getLearned(slug, origin);
    if (learned && learned.recipe) {
      return {
        tier: 'T2',
        recipe: learned.recipe,
        descriptor: (learned.descriptor !== undefined ? learned.descriptor : null)
      };
    }

    var entry = Object.prototype.hasOwnProperty.call(REGISTRY, slug) ? REGISTRY[slug] : null;

    // CGEN-03: descriptor-only no-dead-entry fallback. A slug that is SEARCHABLE
    // (present in FsbRecipeIndex.descriptors, the array capability-search.js indexes)
    // but has NO REGISTRY handler and NO recipe would otherwise return null here ->
    // the router's switch hits its default and returns RECIPE_NOT_FOUND for a slug
    // that search CAN surface (the discoverable-but-uninvocable dead entry, the
    // headline risk of Phase 36). Resolve it to a non-null SEAM tier so the router's
    // existing switch (UNCHANGED) yields an actionable typed reason:
    //   - backing 'learn' -> tier 'T2' (NO recipe -> the router takes its
    //                        RECIPE_LEARN_PENDING leg; discovery can learn it later)
    //   - backing 'dom' / absent -> tier 'T3' -> RECIPE_DOM_FALLBACK_PENDING
    // The literals 'T2'/'T3' are EXACT: any other tier string hits the router default
    // -> RECIPE_NOT_FOUND (the bug). We NEVER fabricate a recipe here (never auto-mint
    // a credentialed call from guessed auth) -- T2 carries NO recipe field; both T2 and
    // T3 are seam tiers the router maps WITHOUT executing. (Decision B: the descriptor's
    // own backing flag is the seam signal; Phase-36 smoke descriptors are all
    // backing:'dom' -> T3; a backing:'learn' descriptor exercises the T2 leg.)
    if (!entry) {
      var desc = _getDescriptor(slug);
      if (desc) {
        return {
          tier: (desc.backing === 'learn') ? 'T2' : 'T3',
          descriptor: desc
        };
      }
      return null;   // genuinely-unknown slug ONLY (not in REGISTRY, not in descriptors) -> RECIPE_NOT_FOUND (correct)
    }

    // HEAL-03 / D-11: a SESSION-quarantined bundled slug is SKIPPED -> return null so
    // the router falls through to the next tier / the DOM fallback. This sits AFTER
    // the learned-first check above (a fresh re-learned recipe already returned its T2
    // hit and is never demoted here -- the bundled skip applies ONLY to the REGISTRY
    // entry) and BEFORE any T1a/T1b/T0/seam return, so it demotes the bundled recipe
    // regardless of its declared tier. The REGISTRY object is NEVER mutated (D-09).
    if (Object.prototype.hasOwnProperty.call(quarantinedBundledSlugs, slug)) {
      return null;
    }

    // Multiple same-class candidates -> owned-origin-first bias picks one. The tier
    // stays explicit (every candidate of an authored slug shares its class).
    if (Array.isArray(entry)) {
      entry = biasByOwnedOrigin(entry, origin);
      if (!entry) return null;
    }

    var tier = entry.tier;

    // T1b / T0: ensure a recipe is attached (authored inline first, then the live
    // search slug->recipe map, D-04). The router also re-derives the recipe, so a
    // null here is non-fatal (it falls back to _search() and ultimately
    // RECIPE_NOT_FOUND).
    if (tier === 'T1b' || tier === 'T0') {
      var recipe = entry.recipe || _getRecipeBySlug(slug) || null;
      return {
        tier: tier,
        recipe: recipe,
        descriptor: entry.descriptor || null
      };
    }

    // T1a: the bundled head handler (registered by a Plan-03 module). A T1a entry is
    // IMPERATIVE handler CODE that builds its own bound spec(s) internally -- it has NO
    // declarative recipe and therefore NO expectedShape, so this shape intentionally
    // carries no `recipe` field (WR-02). The router's head-path rot classify hook
    // (capability-router.js _runHandlerTier) consequently exercises only the status /
    // redirect / fetch-failed rot rows on the head tier, never the expectedShape row.
    if (tier === 'T1a') {
      return {
        tier: tier,
        handler: entry.handler || null,
        origin: entry.origin || null,
        descriptor: entry.descriptor || null
      };
    }

    // T2 / T3 / any other explicitly-declared seam tier: return the tier verbatim;
    // the router maps it to the typed fall-through reason (RECIPE_LEARN_PENDING /
    // RECIPE_DOM_FALLBACK_PENDING) and does NOT execute.
    return {
      tier: tier,
      descriptor: entry.descriptor || null
    };
  }

  // ---- Export shape (dual-export IIFE; mirror capability-search.js:226-241) -----
  var exportsObj = {
    resolve: resolve,
    registerHandler: registerHandler,
    seedHeadHandlers: seedHeadHandlers,
    biasByOwnedOrigin: biasByOwnedOrigin,
    quarantineBundled: quarantineBundled,           // HEAL-03/D-09: the router flags a rotted bundled slug
    clearBundledQuarantine: clearBundledQuarantine, // HEAL-03/D-12: clear the session quarantine
    _getLearned: _getLearned   // LEARN-04: exposed for the learned-first resolve test/inspection
  };

  global.FsbCapabilityCatalog = exportsObj;   // SW importScripts consumer reads this global

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportsObj;              // Node tests require() this
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
