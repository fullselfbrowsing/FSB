---
phase: 28-lean-mcp-surface-capability-search-eval-harness
plan: 02
subsystem: mcp
tags: [mcp-tools, out-of-registry, inv-01, read-only-queue-split, server-tool, capability-surface]

# Dependency graph
requires:
  - phase: 28-lean-mcp-surface-capability-search-eval-harness
    plan: 01
    provides: capability-search.js (getRecipeBySlug/search) + catalog descriptors that the SW dispatcher (Plan 03) will feed these two tools
  - phase: 26-recipe-schema-bundled-interpreter-mv3-ci-guard
    provides: the RECIPE_.+ verbatim errors.ts passthrough (RECIPE_NOT_FOUND surfaces for free, no errors.ts edit)
provides:
  - mcp/src/tools/capabilities.ts (registerCapabilityTools -- search_capabilities + invoke_capability via server.tool() OUTSIDE TOOL_REGISTRY)
  - search_capabilities in queue.ts readOnlyTools (queue-bypass) + invoke_capability serialized (the entire SURF-05 split)
  - two new MCPMessageType union members (mcp:capabilities-search read-only, mcp:capabilities-invoke queued) -- the wire-name contract Plan 03 dispatcher routes match
  - runtime.ts registerCapabilityTools call site
affects: [Plan 28-03, Plan 28-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two MCP tools registered ONLY via server.tool() out-of-registry (vault.ts precedent) so the frozen EXPECTED_NON_TRIGGER_REGISTRY_HASH never moves -- the INV-01 seam (D-09/D-15)"
    - "Read-only/queued split is data-driven: a single readOnlyTools Set membership decides bypass (search_capabilities, like search_memory) vs serialize (invoke_capability, like fill_credential); BOTH still wrap their body in queue.enqueue (D-10/SURF-05)"
    - "invoke_capability uses a GENERIC zod shape {slug,params?,tab_id?} because a static server.tool() schema cannot express dynamic per-recipe params; param validation is delegated SW-side to interpretRecipe (D-10)"
    - "New bridge message names join the MCPMessageType union so bridge.sendAndWait / sendAgentScopedBridgeMessage type-check -- without touching TOOL_REGISTRY or tool-definitions.{js,cjs}"

key-files:
  created:
    - mcp/src/tools/capabilities.ts
  modified:
    - mcp/src/queue.ts
    - mcp/src/runtime.ts
    - mcp/src/types.ts

key-decisions:
  - "Both tools register via server.tool() OUTSIDE TOOL_REGISTRY (vault.ts security-boundary precedent) -- the entire INV-01 strategy; adding them to the registry would move the frozen parity hash AND force autopilot getPublicTools() exposure (D-09, Anti-Pattern 1)"
  - "search_capabilities joins readOnlyTools (bypass); invoke_capability deliberately does NOT (serialized) -- the Set is the ONE place the SURF-05 split lives (D-10)"
  - "invoke_capability schema is generic {slug, params?: z.record(z.any()), tab_id?}; per-recipe param validation is SW-side in interpretRecipe, not at the MCP layer (D-06/D-10)"
  - "Bridge wire names mcp:capabilities-search (read-only) and mcp:capabilities-invoke (queued) match the SW dispatcher routes Plan 03 will add; invoke uses sendAgentScopedBridgeMessage (agent-scoped, like fill_credential), search uses bridge.sendAndWait (like search_memory)"
  - "invoke timeout 30_000ms (real authenticated round-trip) vs search 5_000ms (read-only budget); no errors.ts edit -- RECIPE_NOT_FOUND surfaces via the existing /^RECIPE_.+$/ passthrough"

patterns-established:
  - "Pattern: a new out-of-registry MCP tool file mirrors vault.ts imports (McpServer as a VALUE import) + the SECURITY 'not via TOOL_REGISTRY' doc-comment as the INV-01 intent marker"
  - "Pattern: a new bridge message name is added to the MCPMessageType union in the SAME change that introduces the server.tool() caller (else the typed bridge call fails to compile)"

requirements-completed: [SURF-03, SURF-05, SURF-01, SURF-02]

# Metrics
duration: 7min
completed: 2026-06-21
---

# Phase 28 Plan 02: Lean Two-Tool MCP Capability Surface Summary

**The INV-01-preserving wire surface: search_capabilities (read-only, queue-bypass) and invoke_capability (queued) registered via server.tool() OUTSIDE TOOL_REGISTRY in a new capabilities.ts, wired into runtime.ts, with search_capabilities the lone addition to queue.ts readOnlyTools -- the built MCP module compiles clean and the frozen tool-definitions-parity registry hash never moves (65 tools on the wire, registry unchanged).**

## Performance

- **Duration:** ~7 min
- **Completed:** 2026-06-21
- **Tasks:** 2
- **Files changed:** 4 (1 created, 3 modified)

## Accomplishments

- Created `mcp/src/tools/capabilities.ts` (`registerCapabilityTools(server, bridge, queue, agentScope)`) with the two out-of-registry tools modeled byte-for-byte on `vault.ts` (imports + SECURITY "not via TOOL_REGISTRY" doc-comment) and `observability.ts` `search_memory` (read-only body): `search_capabilities` (zod `{query, origin?, topN?}`, `bridge.sendAndWait` to `mcp:capabilities-search`, schema-on-hit description) and `invoke_capability` (generic zod `{slug, params?, tab_id?}`, `sendAgentScopedBridgeMessage` to `mcp:capabilities-invoke`, 30s timeout) (SURF-01, SURF-02, SURF-03; D-09, D-10).
- Implemented the entire SURF-05 read-only/queued split with a single `queue.ts` line: `'search_capabilities'` added to the `readOnlyTools` Set (bypasses, like `search_memory`); `invoke_capability` deliberately NOT added (serialized via `queue.enqueue`, like `fill_credential`) -- `grep -c "invoke_capability" mcp/src/queue.ts` is 0 as required.
- Wired `registerCapabilityTools` into `runtime.ts` (import + call adjacent to `registerVaultTools`), keeping the 4-arg `(server, bridge, queue, agentScope)` convention shared by every `register*Tools`.
- Held INV-01: the built MCP module compiles clean and `tool-definitions-parity.test.js` is green (256 passed, `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unmoved) because `TOOL_REGISTRY` / `tool-definitions.{js,cjs}` were never touched. A live runtime probe confirms 65 tools on the wire (63 + the 2 new) with both new names present -- on-the-wire AND hash-unchanged, the explicit INV-01 proof (the dedicated surface test is Plan 04).

## Task Commits

Each task was committed atomically:

1. **Task 1: capabilities.ts (two out-of-registry tools) + search_capabilities -> readOnlyTools** - `7d9edf79` (feat)
2. **Task 2: wire registerCapabilityTools into runtime.ts + verify build + INV-01 hash** - `dd479959` (feat)

## Files Created/Modified

- `mcp/src/tools/capabilities.ts` (created) - `registerCapabilityTools`: two `server.tool()` calls OUTSIDE `TOOL_REGISTRY` with the SECURITY/INV-01 doc-comment, the D-10 zod shapes, the `mcp:capabilities-search` / `mcp:capabilities-invoke` bridge messages, and the queue-bypass-vs-serialize split.
- `mcp/src/queue.ts` (modified) - single line: `'search_capabilities'` added to the "Non-registry read-only tools" block of the `readOnlyTools` Set (right after `'search_memory'`). `invoke_capability` intentionally absent.
- `mcp/src/runtime.ts` (modified) - `import { registerCapabilityTools } from './tools/capabilities.js';` + the call `registerCapabilityTools(server, bridge, queue, agentScope);` after `registerVaultTools(...)`.
- `mcp/src/types.ts` (modified) - two new `MCPMessageType` union members (`mcp:capabilities-search`, `mcp:capabilities-invoke`) so the typed bridge calls in `capabilities.ts` compile (see Deviations -- Rule 3 blocking type wiring; INV-01 unaffected).

## Decisions Made

- **Out-of-registry registration is the whole INV-01 strategy (D-09):** both tools use `server.tool()` only; the SECURITY doc-comment states "registered directly (not via TOOL_REGISTRY)". Adding them to `TOOL_REGISTRY` would move the frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` AND force autopilot exposure via `getPublicTools()` -- both avoided.
- **The readOnlyTools Set is the single point of truth for SURF-05:** `search_capabilities` bypasses (Set member, like `search_memory`); `invoke_capability` serializes (NOT a member, like `fill_credential`). Both still wrap their body in `queue.enqueue(name, fn)` -- membership alone decides bypass-vs-serialize, so a mutating invoke can never race ahead of an in-flight mutation (T-28-05 mitigation).
- **invoke_capability schema is generic (D-10):** `{slug, params: z.record(z.any()).optional(), tab_id?}`. A static `server.tool()` schema cannot express dynamic per-recipe params; validation is delegated SW-side to `interpretRecipe` (Plan 03's dispatcher path). The `origin` param on search is documented as a non-authoritative override only (T-28-01a mitigation) -- the authoritative owned-tab origin is resolved SW-side in Plan 03.
- **Timeouts and error surfacing:** search 5s (read-only budget, like `search_memory`); invoke 30s (a real authenticated network round-trip, shorter than the 125s payment gate). No `errors.ts` edit -- a bad slug's `RECIPE_NOT_FOUND` (and `interpretRecipe`'s typed `RECIPE_*` returns) surface verbatim through the existing `/^RECIPE_.+$/` passthrough (D-07).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Extended the MCPMessageType union for the two new bridge message names**
- **Found during:** Task 1 (first `npm --prefix mcp run build` after creating `capabilities.ts`)
- **Issue:** `bridge.sendAndWait({ type: 'mcp:capabilities-search', ... })` and `sendAgentScopedBridgeMessage(..., 'mcp:capabilities-invoke', ...)` failed to compile with TS2322/TS2345: `'mcp:capabilities-search'` / `'mcp:capabilities-invoke'` are not assignable to `MCPMessageType`. Every existing bridge message (e.g. `mcp:search-memory`, `mcp:fill-credential`) is a member of that union in `mcp/src/types.ts`; the two new names were not yet declared, so the typed bridge call could not type-check. The plan's `<action>` did not call this out (it focused on the three named files), but the build gate cannot pass without it.
- **Fix:** Added `| 'mcp:capabilities-search'` and `| 'mcp:capabilities-invoke'` to the `MCPMessageType` union (right after the vault block, before the `agent:*` members), mirroring how `mcp:search-memory` and `mcp:fill-credential` are declared. This is type-only wiring on the bridge-message contract -- it does NOT touch `TOOL_REGISTRY` or `tool-definitions.{js,cjs}`, so the INV-01 parity hash is unaffected (re-verified: 256 passed, hash unmoved). The new wire names are exactly the routes Plan 03's dispatcher will register, so this also pins the cross-plan `key_link` contract.
- **Files modified:** mcp/src/types.ts
- **Verification:** `npm --prefix mcp run build` exit 0; `node tests/tool-definitions-parity.test.js` exit 0 (256 passed, registry hash unchanged); compiled `mcp/build/tools/capabilities.js` carries both message names.
- **Committed in:** `7d9edf79` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking-issue)
**Impact on plan:** Confined to the bridge-message type contract (a one-spot union add). No tool-schema, registry, or runtime-behavior change beyond the two intended tools; INV-01 held. No scope creep -- the two added union members are the exact wire names the plan already mandates for Plan 03's routes.

## Authentication Gates

None - this plan is pure MCP-server-side tool registration; no auth, login, or external service interaction occurred.

## Known Stubs

None. Both tools are fully wired at the MCP layer (real `server.tool()` registration, real `queue.enqueue` split, real bridge messages). The SW-side dispatcher handlers that the bridge messages route to are intentionally out of scope here -- they are Plan 03's deliverable (the plan's `key_links` point `capabilities.ts -> extension/ws/mcp-tool-dispatcher.js`). This is the designed Wave 1 / Wave 2 boundary, not an unresolved stub: the tools register and the wire contract is fixed; the SW routes that consume `mcp:capabilities-search` / `mcp:capabilities-invoke` land in Plan 03.

## User Setup Required

None.

## Next Plan Readiness

- The two tools are on the wire with their bridge-message names fixed (`mcp:capabilities-search` read-only, `mcp:capabilities-invoke` queued). **Plan 03** adds the SW dispatcher routes (`MCP_PHASE199_MESSAGE_ROUTES`) + the `mcp-bridge-client.js` delegates keyed by these exact names, resolves the authoritative owned-tab origin SW-side (T-28-01a), and runs the direct `getRecipeBySlug -> interpretRecipe -> executeBoundSpec` invoke path consuming Plan 01's `capability-search.js`.
- **Plan 04** adds `tests/capability-mcp-surface.test.js` (both tool names on the wire AND the registry hash unchanged -- the dedicated INV-01 proof) and the queue-split assertion; this plan deliberately did NOT author that test.
- The read-only/queued split (SURF-05) and the out-of-registry registration (SURF-03) are complete and proven at the MCP layer; the registry hash is unmoved.

## Self-Check: PASSED

- Created file exists on disk: `mcp/src/tools/capabilities.ts` (FOUND), compiled `mcp/build/tools/capabilities.js` (FOUND).
- Both task commits exist in git history: `7d9edf79` (Task 1), `dd479959` (Task 2).
- Plan-close gate green: `npm --prefix mcp run build` (exit 0) AND `node tests/tool-definitions-parity.test.js` (exit 0, 256 passed, `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unchanged -- INV-01 held).
- Acceptance criteria checks: `registerCapabilityTools` in `capabilities.ts` (1) and `runtime.ts` (2 = import + call); both tool-name literals and both `mcp:capabilities-*` messages present in `capabilities.ts`; `search_capabilities` in `queue.ts` (1) and `invoke_capability` in `queue.ts` (0); `tool-definitions.{js,cjs}` byte-untouched (no git diff). Live runtime probe: 65 tools on the wire, both new names present.

---
*Phase: 28-lean-mcp-surface-capability-search-eval-harness*
*Completed: 2026-06-21*
