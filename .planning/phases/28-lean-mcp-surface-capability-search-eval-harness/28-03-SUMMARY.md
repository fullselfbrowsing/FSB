---
phase: 28-lean-mcp-surface-capability-search-eval-harness
plan: 03
subsystem: extension-sw
tags: [mcp-dispatcher, bridge-client, capability-surface, routerless-invoke, owned-tab-origin, message-routes, recipe-not-found]

# Dependency graph
requires:
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 01
    provides: extension/utils/capability-search.js (FsbCapabilitySearch.search + getRecipeBySlug) + the catalog descriptors the search handler ranks over
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 02
    provides: the mcp:capabilities-search (read-only) / mcp:capabilities-invoke (queued) bridge wire names this plan's SW dispatcher routes match exactly
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: FsbCapabilityInterpreter.interpretRecipe (SW-side param validation + origin-pin) + FsbCapabilityFetch.executeBoundSpec (MAIN-world credentialed fetch + active-tab origin-pin) -- the routerless invoke path
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: the /^RECIPE_.+$/ verbatim errors.ts passthrough (RECIPE_NOT_FOUND surfaces for free, no errors.ts edit)
provides:
  - two MCP_PHASE199_MESSAGE_ROUTES entries (mcp:capabilities-search read-only, mcp:capabilities-invoke queued) in the capabilities routeFamily
  - handleCapabilitiesSearchMessageRoute (un-spoofable SW-side owned-tab origin resolution + topN clamp + FsbCapabilitySearch.search)
  - handleCapabilitiesInvokeMessageRoute (routerless slug -> getRecipeBySlug -> interpretRecipe -> executeBoundSpec; RECIPE_NOT_FOUND for unknown slugs)
  - two mcp-bridge-client.js switch cases + thin _handleCapabilities* delegates into dispatchMcpMessageRoute
affects: [Plan 28-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A new read-only/queued SW message route is two pieces: a MCP_PHASE199_MESSAGE_ROUTES entry (standalone handler: form, like mcp:search-memory) + a hoisted async function handler; the bridge-client switch delegates into dispatchMcpMessageRoute via a thin _handleX method (the search_memory precedent cloned)"
    - "The owned-tab origin for the search bias is resolved authoritatively SW-side in the dispatcher handler via new URL(tabs[0].url).origin (capability-fetch.js:285-291 pattern); the model-supplied payload.origin is a non-authoritative override only (D-11, T-28-01)"
    - "invoke is the routerless direct Phase-27 path (NO Phase-29 capability-router): slug -> FsbCapabilitySearch.getRecipeBySlug -> FsbCapabilityInterpreter.interpretRecipe (validates params SW-side, re-asserts origin-pin) -> FsbCapabilityFetch.executeBoundSpec (page MAIN-world fetch, second active-tab origin-pin) (D-06)"
    - "An unknown slug returns the RECIPE_NOT_FOUND dual-field shape { success:false, code, errorCode, error, slug } and a typed RECIPE_* interpret failure is returned verbatim; both surface through the existing errors.ts /^RECIPE_.+$/ passthrough with no errors.ts edit (D-07)"

key-files:
  created: []
  modified:
    - extension/ws/mcp-tool-dispatcher.js
    - extension/ws/mcp-bridge-client.js

key-decisions:
  - "Both routes use the standalone handler: form (like mcp:search-memory), NOT the helperName: form -- the bridge-client _handleCapabilities* delegates call dispatchMcpMessageRoute, which then invokes these handlers (D-10)"
  - "The search handler resolves the un-spoofable owned-tab origin SW-side and clamps topN via the existing boundedPositiveInt(payload.topN, 5, 5) helper (<=5 cap); returns the { success:true, results } search-memory return shape (SURF-01, D-11)"
  - "The invoke handler runs UNGATED (consent is Phase 30) -- it resolves the active/owned tab directly via chrome.tabs.query (the search_memory precedent that does not gate either); the two-point origin-pin still holds because executeBoundSpec re-asserts tabOrigin === spec.origin before any side effect, so NO new fetch path bypasses Wall 2 (D-06, T-28-01, T-28-02)"
  - "No errors.ts edit: RECIPE_NOT_FOUND (unknown slug) and interpretRecipe's typed RECIPE_* returns surface verbatim via the existing /^RECIPE_.+$/ passthrough; the engine-unavailable arms use createMcpRouteError (the handleSearchMemoryMessageRoute precedent) (D-07, T-28-07b)"
  - "The bridge delegates are pure pass-throughs (no origin/tab resolution) -- the authoritative resolution lives ONLY in the dispatcher handlers, so there is a single un-spoofable resolution point (T-28-01)"

patterns-established:
  - "Pattern: a new capabilities-family route registers as a standalone async function handler hoisted above the MCP_PHASE199_MESSAGE_ROUTES const literal that references it (JS function-declaration hoisting), mirroring handleSearchMemoryMessageRoute"
  - "Pattern: model-influenced bridge payload fields (origin, tab_id) are non-authoritative overrides; the SW handler resolves the authoritative owned tab/origin from chrome.tabs.query and the engine re-asserts the pin -- defense beyond the override"

requirements-completed: [SURF-01, SURF-02]

# Metrics
duration: 3min
completed: 2026-06-20
---

# Phase 28 Plan 03: Capability Surface SW Transport Summary

**The extension SW transport for the two capability tools: two MCP_PHASE199_MESSAGE_ROUTES entries (read-only mcp:capabilities-search + queued mcp:capabilities-invoke) with their dispatcher handlers, and the two thin mcp-bridge-client delegates -- the search handler resolves the un-spoofable owned-tab origin SW-side and returns <=5 ranked schema-on-hit hits; the invoke handler runs the routerless direct Phase-27 path (slug -> interpretRecipe -> executeBoundSpec) and surfaces RECIPE_NOT_FOUND for unknown slugs, all matching the Plan 02 wire names with no errors.ts edit.**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-06-20
- **Tasks:** 2
- **Files changed:** 2 (0 created, 2 modified)

## Accomplishments

- Added two `MCP_PHASE199_MESSAGE_ROUTES` entries in the `capabilities` routeFamily using the standalone `handler:` form (the `mcp:search-memory` precedent, NOT `helperName:`): `mcp:capabilities-search` (read-only) and `mcp:capabilities-invoke` (queued). The wire names match Plan 02's `capabilities.ts` bridge messages exactly (verified against 28-02-SUMMARY), so the cross-plan `key_link` (capabilities.ts -> mcp-tool-dispatcher.js) closes (SURF-01, SURF-02; D-10).
- Implemented `handleCapabilitiesSearchMessageRoute` (SURF-01, D-11): availability guard via `createMcpRouteError('search_capabilities', 'capabilities', ...)`; resolves the owned-tab origin authoritatively SW-side (`new URL(tabs[0].url).origin`, the `capability-fetch.js:285-291` pattern) -- `payload.origin` is a non-authoritative override only; clamps `topN` via the existing `boundedPositiveInt(payload.topN, 5, 5)` (the `<=5` cap); calls `FsbCapabilitySearch.search(query, ownedOrigin, topN)` and returns the `{ success:true, results }` search-memory return shape.
- Implemented `handleCapabilitiesInvokeMessageRoute` (SURF-02, D-06/D-07): guards all three engine globals; `recipe = FsbCapabilitySearch.getRecipeBySlug(payload.slug)` and returns the `RECIPE_NOT_FOUND` dual-field shape `{ success:false, code, errorCode, error, slug }` on an absent recipe; `interpreted = FsbCapabilityInterpreter.interpretRecipe(recipe, payload.params || {})` and returns a typed `RECIPE_*` interpret failure verbatim; resolves `tabId` (explicit `payload.tab_id` else active/owned tab); `return await FsbCapabilityFetch.executeBoundSpec(interpreted.spec, tabId)` (the normalized `{ success,status,finalUrl,redirected,data,text }` shape). No Phase-29 router; UNGATED but the two-point origin-pin still holds (executeBoundSpec re-asserts `tabOrigin === spec.origin`).
- Added the two `_handleMessage` switch cases (before the `default:` throw at line 516, after the `mcp:search-memory` case) plus the two thin `_handleCapabilitiesSearch` / `_handleCapabilitiesInvoke` delegate methods modeled on `_handleSearchMemory` -- each calls `dispatchMcpMessageRoute({ type, payload, client: this })` and returns `response || {}`. Pure pass-throughs: origin/tab resolution lives ONLY in the dispatcher handlers, so there is a single un-spoofable resolution point (T-28-01).
- No `mcp/src/errors.ts` edit: `RECIPE_NOT_FOUND` (currently unused) and `interpretRecipe`'s typed `RECIPE_*` returns surface verbatim via the existing `/^RECIPE_.+$/` passthrough (D-07). Plan-close gates green: `node --check` on both files, `node scripts/validate-extension.mjs` (manifest valid, 268 JS files parsed clean), and `node scripts/verify-recipe-path-guard.mjs` (8 recipe-path files clean, 5 on-disk capability modules all on the allowlist).

## Task Commits

Each task was committed atomically:

1. **Task 1: capabilities-search/-invoke dispatcher routes + handlers** - `828e8504` (feat)
2. **Task 2: capabilities-search/-invoke bridge-client delegates** - `d53d08ea` (feat)

## Files Created/Modified

- `extension/ws/mcp-tool-dispatcher.js` (modified) - two `MCP_PHASE199_MESSAGE_ROUTES` entries (`mcp:capabilities-search`, `mcp:capabilities-invoke`, capabilities routeFamily) + `handleCapabilitiesSearchMessageRoute` (SW-side un-spoofable origin resolution + topN clamp + `FsbCapabilitySearch.search`) + `handleCapabilitiesInvokeMessageRoute` (routerless `getRecipeBySlug -> interpretRecipe -> executeBoundSpec` + `RECIPE_NOT_FOUND`). 62 insertions.
- `extension/ws/mcp-bridge-client.js` (modified) - two `_handleMessage` switch cases (before the default throw) + thin `_handleCapabilitiesSearch` / `_handleCapabilitiesInvoke` delegates into `dispatchMcpMessageRoute` (the `_handleSearchMemory` clone). 30 insertions.

## Decisions Made

- **Standalone `handler:` route form (D-10):** both routes use `{ routeFamily: 'capabilities', handler: handleCapabilities*MessageRoute }` (the `mcp:search-memory` shape), NOT the `helperName:` form. The bridge-client `_handleCapabilities*` delegates call `dispatchMcpMessageRoute`, which looks up the route and invokes the handler. The handlers are declared as hoisted `async function` declarations so the `const MCP_PHASE199_MESSAGE_ROUTES` literal at the top of the file can reference them (JS function-declaration hoisting -- the same mechanism `handleSearchMemoryMessageRoute` relies on).
- **Authoritative origin/tab resolution lives in the dispatcher only (D-11, T-28-01):** the search handler resolves `new URL(tabs[0].url).origin` SW-side and the invoke handler resolves `tabId` SW-side; the model-supplied `payload.origin` / `payload.tab_id` are optional non-authoritative overrides. The bridge delegates are pure pass-throughs (no resolution), so there is a single un-spoofable point and no duplicate/divergent resolution.
- **Routerless invoke, UNGATED, pin still holds (D-06, T-28-02):** invoke composes the existing Phase-27 engine directly (slug -> `interpretRecipe` -> `executeBoundSpec`) with NO Phase-29 capability-router. It runs ungated (consent is Phase 30) and resolves the active/owned tab via `chrome.tabs.query` directly (the `search_memory` precedent that does not gate either). The two-point origin-pin still holds: `interpretRecipe` pins the effective target and `executeBoundSpec` re-asserts `tabOrigin === spec.origin` before any side effect -- this plan introduces NO new fetch path that bypasses that re-assertion (Wall 2).
- **No errors.ts edit (D-07, T-28-07b):** `RECIPE_NOT_FOUND` returns the dual-field shape (`code`/`errorCode`/`error` all `'RECIPE_NOT_FOUND'` + `slug`) and surfaces verbatim via the existing `/^RECIPE_.+$/` passthrough; `interpretRecipe`'s typed `RECIPE_*` returns pass through the same arm. The engine-unavailable arms use `createMcpRouteError` (the `handleSearchMemoryMessageRoute` "...unavailable" precedent).

## Deviations from Plan

None - plan executed exactly as written. Both tasks were implemented from the verified RESEARCH reference drafts (28-RESEARCH.md lines 494-549) and the per-file PATTERNS analogs; no auto-fixes (Rules 1-3) or architectural decisions (Rule 4) were required.

### Note on a false-positive verification grep (not a deviation)

During Task 2's acceptance check, a `grep -n "Unknown MCP message type"` matched a COMMENT at line 394 ("...Unknown MCP message type...") before the real `default:` throw at line 516, momentarily printing "FAIL: case after default". A follow-up grep against the literal `throw new Error('Unknown MCP message type'` confirmed the real default throw is at line 516 and the two new cases (lines 472, 475) correctly precede it inside the switch. The code was always correct; only the first grep's match was imprecise. No code change resulted.

## Threat Model Coverage

The plan's `<threat_model>` `mitigate` dispositions for these files were all satisfied by the implementation (no Rule-2 gaps):

- **T-28-01 (Spoofing/Elevation -- model-supplied origin/tab_id):** owned-tab origin resolved SW-side via `new URL(tab.url).origin` (un-spoofable); `payload.origin`/`tab_id` are non-authoritative overrides; the engine active-tab origin-pin (`executeBoundSpec`) rejects a wrong-tab invoke before any side effect. Mitigated.
- **T-28-02 (Tampering -- wrong-but-plausible destructive auto-fire):** invoke runs `slug -> interpretRecipe (validates params + origin-pin) -> executeBoundSpec` only; `sideEffectClass` is visible in the Plan 01 search results so the model can disambiguate. (Enforced disambiguation-before-mutate is Phase 30.) Mitigated to the phase boundary.
- **T-28-07 (Information Disclosure -- invoke result payload):** the handler forwards `executeBoundSpec`'s non-secret `{ success,status,finalUrl,redirected,data,text }` shape unchanged -- no cookies/auth in the payload. Mitigated.
- **T-28-07b (Error Handling -- unknown slug / interpret failure):** unknown slug -> `RECIPE_NOT_FOUND` dual-field; interpret failures returned verbatim as typed `RECIPE_*`, surfaced via the existing `errors.ts:137` passthrough with no leakage of internals. Mitigated.
- **T-28-SC (npm/pip/cargo installs):** ACCEPT -- this plan introduces ZERO new external packages and has no install task; no per-install legitimacy checkpoint required.

## Authentication Gates

None - this plan is pure SW-side transport wiring (dispatcher routes + bridge delegates); no auth, login, or external service interaction occurred. The invoke handler's authenticated fetch is delegated entirely to the existing `executeBoundSpec` page-world spine (credentials carried by `credentials:'include'`, never named or persisted here).

## Known Stubs

None. Both handlers are fully wired: the search handler calls the real `FsbCapabilitySearch.search` (Plan 01) with a real SW-resolved origin; the invoke handler runs the real `getRecipeBySlug -> interpretRecipe -> executeBoundSpec` path. The capability engine globals (`FsbCapabilitySearch`/`FsbCapabilityInterpreter`/`FsbCapabilityFetch`) are loaded as SW globals (Plan 01 + Phase 26/27); the typeof-guarded availability arms degrade gracefully (returning `createMcpRouteError`) if a global is absent in a partial dev tree, which is the designed availability behavior, not an unresolved stub. The end-to-end wire behavior (search returns hits, invoke runs the path, RECIPE_NOT_FOUND surfaces) is asserted by the surface test in Plan 04 (which mocks `executeBoundSpec`).

## Next Plan Readiness

- The SW transport for both capability tools is complete and matches the Plan 02 wire-name contract exactly (`mcp:capabilities-search` read-only, `mcp:capabilities-invoke` queued). The full chain is now wired end-to-end at the code level: MCP `server.tool()` (Plan 02) -> bridge message -> `mcp-bridge-client` switch case -> `_handleCapabilities*` delegate -> `dispatchMcpMessageRoute` -> dispatcher handler -> `FsbCapabilitySearch` / the routerless invoke path (Plan 01 + Phase 26/27).
- **Plan 04** adds `tests/capability-mcp-surface.test.js` (both tool names on the wire AND the `tool-definitions-parity` registry hash unchanged -- the dedicated INV-01 proof) plus the queue-split assertion and the unknown-slug `RECIPE_NOT_FOUND` end-to-end assertion (mocking `executeBoundSpec`); this plan deliberately did NOT author that test.
- No errors.ts edit was made, so the INV-01 surface is undisturbed by this plan; the only files touched are the two SW transport files.

## Self-Check: PASSED

- Modified files exist on disk: `extension/ws/mcp-tool-dispatcher.js` (FOUND), `extension/ws/mcp-bridge-client.js` (FOUND).
- Both task commits exist in git history: `828e8504` (Task 1, FOUND), `d53d08ea` (Task 2, FOUND).
- Per-task acceptance greps: dispatcher -- `mcp:capabilities-search` (1 route entry), `mcp:capabilities-invoke` (1 route entry), `handleCapabilitiesSearchMessageRoute` (2 = route + def), `handleCapabilitiesInvokeMessageRoute` (2 = route + def), `RECIPE_NOT_FOUND` (3 = code/errorCode/error), `FsbCapabilitySearch.getRecipeBySlug` (1), `FsbCapabilityFetch.executeBoundSpec(interpreted.spec` (1), `boundedPositiveInt(payload.topN, 5, 5)` (1); bridge -- `mcp:capabilities-search` (2), `mcp:capabilities-invoke` (2), `_handleCapabilitiesSearch` (2 = case + method), `_handleCapabilitiesInvoke` (2 = case + method), both delegates return `response || {}`, both cases precede the real default throw (line 516).
- Plan-close gates green: `node --check extension/ws/mcp-tool-dispatcher.js` (exit 0), `node --check extension/ws/mcp-bridge-client.js` (exit 0), `node scripts/validate-extension.mjs` (OK -- manifest valid, 268 JS files parsed clean), `node scripts/verify-recipe-path-guard.mjs` (PASS -- 8 recipe-path files clean, 5 on-disk capability modules all on the allowlist).
- No `mcp/src/errors.ts` edit (verified: empty `git status` for that path -- the RECIPE_NOT_FOUND passthrough is reused).

---
*Phase: 28-lean-mcp-surface-capability-search-eval-harness*
*Completed: 2026-06-20*
