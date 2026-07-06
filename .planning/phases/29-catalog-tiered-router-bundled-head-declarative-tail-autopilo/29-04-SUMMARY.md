---
phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
plan: 04
subsystem: api
tags: [capability-router, mcp-dispatcher, invoke-capability, internal-reroute, origin-pin, inv-01, inv-02]

# Dependency graph
requires:
  - phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo
    provides: "Plan 02 shipped FsbCapabilityRouter.invoke(slug, args, {origin, tabId}) -- the shared tiered engine (T0/T1a/T1b/T2/T3) loaded at SW startup; the T1b body is the lifted routerless invoke path"
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    provides: "the Phase-28 routerless handleCapabilitiesInvokeMessageRoute (getRecipeBySlug -> interpretRecipe -> executeBoundSpec) that this plan rewires; the MCP_PHASE199_MESSAGE_ROUTES bindings + wire names (mcp:capabilities-invoke/-search); the INV-01 surface proof tests/capability-mcp-surface.test.js"
  - phase: 27-authenticated-fetch-primitive-main-world-origin-pin-resume-s
    provides: "FsbCapabilityFetch.executeBoundSpec (the second active-tab origin-pin the router routes through but never bypasses)"
provides:
  - "The internal-only reroute (D-03): handleCapabilitiesInvokeMessageRoute is now a single FsbCapabilityRouter.invoke(slug, params, {origin, tabId}) call -- the MCP front door of the one-engine-two-front-doors model (INV-02)"
  - "SW-side authoritative origin + tabId resolution in the invoke handler (the search-handler pattern); payload.origin is a non-authoritative override only (D-11)"
  - "The router-unavailable guard (createMcpRouteError 'Capability router unavailable') replacing the Phase-28 typeof-FsbCapabilitySearch/Interpreter/Fetch engine guard"
affects: [phase-29-plan-03-bundled-head-handlers, phase-29-plan-05-autopilot-tool-executor-branch, phase-30-consent-governance, phase-31-learned-recipes-T2, phase-32-self-healing-DOM-fallback-T3]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Internal-only reroute: the existing SW handler body collapses to one shared-engine call -- NOT a parallel route (the INV-02-forbidden parallel stack)"
    - "Authoritative origin/tabId resolved SW-side from the active/owned tab; the model never supplies the authoritative origin (D-11)"
    - "Wire names + route table + TOOL_REGISTRY byte-unchanged -> the frozen INV-01 registry hash never moves (out-of-registry capability tools)"

key-files:
  created: []
  modified:
    - "extension/ws/mcp-tool-dispatcher.js"

key-decisions:
  - "Rewired ONLY the body of handleCapabilitiesInvokeMessageRoute (D-03 internal-only); the route-table bindings, wire names (mcp:capabilities-invoke/-search), and TOOL_REGISTRY are byte-untouched -- the INV-01 hash is unmoved"
  - "Resolve tabId AND origin in a single chrome.tabs.query when either is missing (payload.tab_id / payload.origin are non-authoritative overrides), preserving the search-handler SW-side resolution while honoring the router's invoke(slug, args, {origin, tabId}) signature"
  - "Swapped the engine guard to the router-unavailable guard (createMcpRouteError with 'Capability router unavailable'), mirroring the handler's existing unavailable branch -- the inline getRecipeBySlug/interpretRecipe/executeBoundSpec body now lives in the router's T1b tier"
  - "No errors.ts edit: typed RECIPE_* fall-through reasons (RECIPE_NOT_FOUND / RECIPE_LEARN_PENDING / RECIPE_DOM_FALLBACK_PENDING) surface verbatim via the existing /^RECIPE_.+$/ passthrough"

patterns-established:
  - "Pattern 1: an MCP dispatcher capability handler resolves the un-spoofable owned-tab origin SW-side, then delegates to the shared FsbCapabilityRouter SW-global (front door 1 of INV-02)"

requirements-completed: [CAT-01, CAT-05]

# Metrics
duration: 4min
completed: 2026-06-21
---

# Phase 29 Plan 04: MCP Invoke Front-Door Reroute Summary

**The internal-only reroute (D-03): `handleCapabilitiesInvokeMessageRoute` now collapses to a single `FsbCapabilityRouter.invoke(slug, params, {origin, tabId})` call -- the MCP front door of the one-engine-two-front-doors model (INV-02) -- with the wire names, route table, and TOOL_REGISTRY byte-unchanged so the frozen INV-01 registry hash never moves and the two-tool surface proof stays green (19/19).**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-21T20:05:00Z (approx)
- **Completed:** 2026-06-21T20:09:00Z (approx)
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Rewired the body of `handleCapabilitiesInvokeMessageRoute` (`extension/ws/mcp-tool-dispatcher.js`) so it is now ONE call to `FsbCapabilityRouter.invoke(payload.slug, payload.params || {}, { origin, tabId })` -- the shared tiered engine Plan 02 shipped. The old inline `getRecipeBySlug -> interpretRecipe -> executeBoundSpec` body is gone from the handler (it lives in the router's T1b tier).
- Replaced the Phase-28 `typeof FsbCapabilitySearch/FsbCapabilityInterpreter/FsbCapabilityFetch` engine guard with the router-unavailable guard: `createMcpRouteError('invoke_capability', 'capabilities', MCP_ROUTE_RECOVERY_HINT, { error: 'Capability router unavailable' })`.
- Resolved `tabId` AND the owned-tab `origin` SW-side (the search-handler pattern): `payload.tab_id` / `payload.origin` act only as non-authoritative overrides; otherwise a single `chrome.tabs.query({active:true,currentWindow:true})` resolves both from the active tab. The model never supplies the authoritative origin (D-11); the two-point origin-pin still holds downstream in `executeBoundSpec`.
- Left the route table (`MCP_PHASE199_MESSAGE_ROUTES`), the wire names (`mcp:capabilities-invoke` / `mcp:capabilities-search`), and `TOOL_REGISTRY` byte-unchanged. Updated only the two header comments (the route-table comment and the handler comment) that said "NO Phase-29 capability-router" to reflect the router is now wired (internal-only).
- INV-01 surface proof stays green: `npm --prefix mcp run build && node tests/capability-mcp-surface.test.js` -> 19 passed / 0 failed (65 tools on the wire, both capability tools out-of-registry, `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unmoved, `RECIPE_NOT_FOUND` surfaced verbatim). The router's own unit suite (`tests/capability-router.test.js`) stays 24/0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewire handleCapabilitiesInvokeMessageRoute to call the router (internal-only reroute)** - `5f01a1e9` (feat)

**Plan metadata:** (this commit) (docs: complete plan)

## Files Created/Modified
- `extension/ws/mcp-tool-dispatcher.js` (modified, +37/-28) - `handleCapabilitiesInvokeMessageRoute` body rewired to one `FsbCapabilityRouter.invoke(...)` call with SW-side origin/tabId resolution + the router-unavailable guard; route-table + handler header comments updated to reflect the wired router. Route-table bindings, wire names, and TOOL_REGISTRY untouched.

## Decisions Made
- **Single `chrome.tabs.query` for both `tabId` and `origin`** when either is unresolved from the payload overrides. The plan's `<action>` specified resolving both SW-side; combining them into one guarded query (rather than two separate queries) is the minimal faithful realization of the search-handler resolution while feeding the router's `{ origin, tabId }` ctx exactly. `payload.tab_id`/`payload.origin` remain non-authoritative overrides (D-11).
- **Kept the router-unavailable guard message as "Capability router unavailable"** (matching the plan's exact `<action>` text and the `<interfaces>` router-unavailable guard), replacing the prior "Capability engine unavailable" -- the handler now depends on `FsbCapabilityRouter.invoke`, so that is the correct unavailability surface.
- **No `errors.ts` edit, no TOOL_REGISTRY edit.** The reroute touches only the handler body and the two adjacent comments. The typed `RECIPE_*` reasons the router returns already pass through `/^RECIPE_.+$/` verbatim; the two capability tools already register outside `TOOL_REGISTRY` (the INV-01 seam established in Phase 28).

## Deviations from Plan

None - plan executed exactly as written.

The plan's `<interfaces>` gave the exact rewired handler shape (the router-unavailable guard, the SW-side origin/tabId resolution copied from the search handler, the single `FsbCapabilityRouter.invoke(...)` return) and the byte-frozen route-table/wire-name constraints; the handler was rewired to those contracts with no auto-fixes, no missing-critical additions, and no blocking-issue workarounds. The router (`FsbCapabilityRouter.invoke`) already existed from Plan 02, so no install or new module was needed.

## Issues Encountered
None. The reroute-shape Node assertion, the build, and the INV-01 surface proof all passed on the first run; `node --check` confirmed the dispatcher parses cleanly and the router unit suite stayed green.

## Threat Surface

This plan ADDS no new security surface (it removes an inline path and delegates to an existing engine). The phase `<threat_model>` mitigations are honored:
- **T-29-11 (Spoofing, client-supplied origin):** the handler resolves `ownedOrigin`/`origin` SW-side from the active tab; `payload.origin` is a non-authoritative override only. `executeBoundSpec` re-pins downstream regardless (the two-point origin-pin still holds on the router path).
- **T-29-12 (Tampering, tool leaking into TOOL_REGISTRY):** the reroute touches only the handler body + comments; no tool-definitions edit. `capability-mcp-surface.test.js` re-asserts `EXPECTED_NON_TRIGGER_REGISTRY_HASH` is unmoved and both names are absent from `TOOL_REGISTRY` (INV-01) -- green.
- **T-29-13 (Elevation, parallel invoke route):** the router is inserted INSIDE the existing handler (one front door); NO new route is added. The unchanged route-table assertion (`'mcp:capabilities-invoke'`/`'mcp:capabilities-search'` still present, byte-identical) verifies this.

## User Setup Required

None - no external service configuration required. One handler-body rewire in a bundled SW module; no manifest/permission change, no new packages (zero external installs this phase).

## Next Phase Readiness
- **Plan 05 (autopilot parity, CAT-04/INV-02):** front door 1 (the MCP dispatcher) now calls the shared `FsbCapabilityRouter.invoke(...)`. Plan 05 adds front door 2 -- the `extension/ai/tool-executor.js` capability branch (mirroring the `trigger` branch) hitting the SAME SW-global. Both doors -> one engine -> one origin-pin; parity is at the runtime layer, not the tool layer (the tools stay out-of-registry).
- **Plan 03 (bundled head, CAT-02):** the invoke front door now routes through the catalog, so a `tier:'T1a'` slug registered by a Plan-03 handler is reachable from MCP `invoke_capability` immediately (the router's T1a dispatch is already live).
- **No blockers.** The two-point origin-pin holds on every tier path; the reroute is internal-only (no parallel stack, INV-02 honored); the INV-01 hash is unmoved.

## Self-Check: PASSED

- File verified on disk: `extension/ws/mcp-tool-dispatcher.js` (FOUND); `.planning/phases/29-catalog-tiered-router-bundled-head-declarative-tail-autopilo/29-04-SUMMARY.md` (FOUND).
- Commit verified in git log: `5f01a1e9` (FOUND).
- Reroute-shape assertion: `FsbCapabilityRouter.invoke` present in the handler body; no inline `FsbCapabilityFetch.executeBoundSpec` / `FsbCapabilityInterpreter.interpretRecipe` in the handler; `'mcp:capabilities-invoke'` + `'mcp:capabilities-search'` route bindings intact -> "reroute shape OK".
- `npm --prefix mcp run build && node tests/capability-mcp-surface.test.js` -> 19 passed / 0 failed (INV-01 hash unmoved, 2 tools on the wire, RECIPE_NOT_FOUND verbatim). `node tests/capability-router.test.js` -> 24 passed / 0 failed. `node --check extension/ws/mcp-tool-dispatcher.js` -> PARSE OK.

---
*Phase: 29-catalog-tiered-router-bundled-head-declarative-tail-autopilo*
*Completed: 2026-06-21*
