---
phase: 57-agent-identity-capture
plan: "03"
subsystem: extension
tags: [mcp, agent-identity, client-inventory, chrome-storage, runtime-api]

# Dependency graph
requires:
  - phase: 57-agent-identity-capture
    provides: Lazy MCP identity/inventory capture and durable clicked, installed, and connected evidence from Plans 01-02
provides:
  - Closed exact MCP client alias vocabulary with raw visibility for unknown identities
  - Fresh, deterministic clicked/installed/connected/live evidence union for downstream UI consumers
  - Own-extension getMcpClients runtime query with same-context dispatch support
  - Cross-stack compatibility locks and permanent Phase 57 root-suite coverage
affects: [58-providers-panel, mcp-client-inventory, extension-runtime-api, mcp-wire-parity]

# Tech tracking
tech-stack:
  added: []
  patterns: [closed alias table, non-authoritative evidence union, own-extension runtime query, byte-stable additive wire freeze]

key-files:
  created:
    - extension/utils/mcp-client-aliases.js
    - tests/mcp-client-merged-view.test.js
    - tests/mcp-client-identity-integration.test.js
  modified:
    - extension/utils/mcp-agent-providers.js
    - extension/background.js
    - tests/mcp-bridge-background-dispatch.test.js
    - tests/mcp-version-parity.test.js
    - tests/lattice-provider-bridge-smoke.test.js
    - package.json

key-decisions:
  - "Join known MCP identities only through a frozen exact alias vocabulary; preserve every unknown non-empty name as a raw, non-authoritative entry."
  - "Re-read durable provider evidence for every merged query and keep clicked, installed, connected, and live objects separate without deriving status priority or a recommendation."
  - "Expose getMcpClients only behind the established own-extension sender guard, while using the in-process registry directly so same-context service-worker calls remain reliable."
  - "Keep getMergedClients non-enumerable on the classic helper API so the pre-existing exact enumerable surface remains byte-compatible while direct consumers can use the additive method."

requirements-completed: [IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05]

# Metrics
duration: 31 min
completed: 2026-07-12
---

# Phase 57 Plan 03: Canonical MCP Client Evidence View Summary

**A deterministic, eviction-safe MCP-client evidence union and guarded runtime query, with unknown identities kept visible but never promoted into authority or recommendation state**

## Performance

- **Duration:** 31 min
- **Started:** 2026-07-12T13:10:49Z
- **Completed:** 2026-07-12T13:42:04Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a frozen, separator-insensitive exact alias table for the supported Claude, Cursor, VS Code, Windsurf, Codex, OpenCode, and OpenClaw identities, with no Gemini or fuzzy matching.
- Built a fresh-on-read union of durable clicked, installed, and connected evidence plus cloned live AgentRecords; unknown client names remain deterministic `raw:*` rows and cannot merge into canonical evidence.
- Added the guarded `getMcpClients` runtime action with exact success/failure envelopes, direct same-context registry access, defensive live clones, and no resurrection of the sunset `listAgents` action.
- Permanently wired all six Phase 57 contract tests into `npm test` and froze the additive wire, registration response, and pre-Phase-57 tool-definition surface across the real daemon/extension stack.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the closed MCP-client alias vocabulary and deterministic merge** - `72530863` (feat)
2. **Task 2: Add the guarded getMcpClients runtime query** - `59564df2` (feat)
3. **Task 3: Freeze cross-stack identity compatibility and root-suite coverage** - `e204e759` (test)

## Files Created/Modified

- `extension/utils/mcp-client-aliases.js` - Pure classic-script normalizer and closed exact alias resolver.
- `extension/utils/mcp-agent-providers.js` - Fresh durable rehydration and deterministic six-field evidence union.
- `extension/background.js` - Alias-before-provider boot order and guarded `getMcpClients` runtime dispatch.
- `tests/mcp-client-merged-view.test.js` - Alias, union, raw-unknown, eviction, sender-guard, same-context, and bounded-failure coverage.
- `tests/mcp-bridge-background-dispatch.test.js` - Direct runtime bridge coverage for cloned/empty/failing live registry states.
- `tests/mcp-client-identity-integration.test.js` - Real daemon runtime, AgentScope, transport, registry, dispatcher, storage, and merged-view integration proof.
- `tests/mcp-version-parity.test.js` - Exact pre-Phase-57 wire/order, response-union, registration-envelope, and tool-definition hash freeze.
- `tests/lattice-provider-bridge-smoke.test.js` - Advances paired import source pins for the required alias helper import.
- `package.json` - Runs all six Phase 57 tests permanently in dependency order.

## Decisions Made

- Alias matching is a closed vocabulary: normalization only removes case and separator drift, while substring and fuzzy lookalikes stay raw.
- The merged view is evidence-only. It preserves source objects and null placeholders, but does not flatten status, rank evidence, recommend a provider, mutate storage, or render UI.
- The runtime action reads `globalThis.fsbAgentRegistryInstance.listAgents()` only within the established same-context path and returns an empty live set when no registry exists.
- The additive merge method is directly callable but non-enumerable, preserving the helper's locked pre-existing enumerable API contract.

## Verification

- npm --prefix mcp run build - PASS
- node tests/mcp-client-identity.test.js - PASS
- node tests/mcp-client-inventory.test.js - PASS
- node tests/mcp-agent-providers-storage.test.js - PASS
- node tests/onboarding-agent-provider-clicks.test.js - PASS
- node tests/mcp-client-merged-view.test.js - PASS
- node tests/mcp-client-identity-integration.test.js - PASS
- node tests/mcp-bridge-background-dispatch.test.js - PASS (53 assertions)
- node tests/runtime-contracts.test.js - PASS (13 assertions)
- node tests/mcp-version-parity.test.js - PASS (16 assertions)
- node tests/visual-session-schema-lock.test.js - PASS (344 assertions)
- node tests/tool-definitions-parity.test.js - PASS (260 assertions)
- node tests/lattice-provider-bridge-smoke.test.js - PASS (110 assertions)
- npm test - PASS at committed HEAD `e204e759` in a detached clean worktree through the final `no-orphan-descriptor.test.js` gate. The main workspace run reached the known user-owned deletion of a historical Phase 39 planning fixture after all preceding tests passed.
- Scope audit - PASS: no manifest, onboarding UI, provider recommendation, tool schema, Gemini alias, active sunset `listAgents`, or Phase 58 changes.
- `git diff --check` - PASS

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved the locked enumerable helper API while adding the merge method**
- **Found during:** Task 1 focused regression verification
- **Issue:** An existing storage contract pins the exact enumerable keys of `FsbMcpAgentProviders`; assigning the new method normally would break that compatibility lock.
- **Fix:** Defined `getMergedClients` as a non-enumerable, immutable additive property while keeping direct calls unchanged.
- **Files modified:** `extension/utils/mcp-agent-providers.js`
- **Verification:** Provider storage and merged-view tests both pass.
- **Committed in:** `72530863`

**2. [Rule 3 - Blocking] Advanced the paired background import source pins**
- **Found during:** Full repository regression verification
- **Issue:** The required alias classic-script import increased both exact `importScripts` source counts by one.
- **Fix:** Advanced the paired lattice smoke pins from 310/306 to 311/307 without weakening the tripwire.
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js`
- **Verification:** The direct gate passes 110 assertions and the full clean-worktree suite exits 0.
- **Committed in:** `e204e759`

**3. [Rule 3 - Blocking] Isolated full regression verification from unrelated user-owned deletions**
- **Found during:** Final `npm test` verification
- **Issue:** The main workspace intentionally lacks historical Phase 39 planning fixtures, so the late coverage report stops on `ENOENT` despite every preceding test passing.
- **Fix:** Ran the identical full command in a detached clean worktree at `e204e759`, reusing ignored locked dependency trees, then removed the temporary worktree. No user-owned file was restored, staged, or modified.
- **Files modified:** None.
- **Verification:** Full `npm test` exited 0 through `no-orphan-descriptor.test.js`.
- **Committed in:** Not committed (verification environment only).

---

**Total deviations:** 3 auto-fixed (3 blocking)
**Impact on plan:** The fixes preserve existing compatibility locks and deterministic verification; production scope remains the planned evidence-only data layer and runtime query.

## Issues Encountered

None beyond the auto-fixed compatibility and verification-environment issues documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 57 is complete: all five IDENT requirements have executable cross-stack evidence.
- Phase 58 can consume one stable `getMcpClients` read model without reassembling storage or live-registry state.
- No implementation, compatibility, or verification blockers remain; Phase 58 work was intentionally not started.

## Self-Check: PASSED

- All three created files and every planned implementation surface exist on disk.
- Task commits `72530863`, `59564df2`, and `e204e759` exist in git history.
- `requirements-completed` exactly matches `[IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05]`.
- Full root regression passes from committed HEAD in an isolated clean worktree.

---
*Phase: 57-agent-identity-capture*
*Completed: 2026-07-12*
