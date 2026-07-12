---
phase: 57-agent-identity-capture
plan: "02"
subsystem: extension
tags: [mcp, agent-identity, chrome-storage, onboarding, inventory]

# Dependency graph
requires:
  - phase: 57-agent-identity-capture
    provides: Lazy MCP clientInfo capture and process-lifetime installed-client inventory from Plan 01
provides:
  - Eviction-safe fsbAgentProviders storage for clicked, connected, and installed evidence
  - Sanitized live AgentRecord identity plus additive registration and system-frame ingestion
  - Non-blocking onboarding copy-intent persistence with exact base, fan, and all attribution
affects: [57-03-merged-view, 58-providers-panel, mcp-registration, onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns: [classic-script global helper, Promise-chain storage mutex, sibling-preserving envelope mutation, fire-and-forget UI persistence]

key-files:
  created:
    - extension/utils/mcp-agent-providers.js
    - tests/mcp-agent-providers-storage.test.js
    - tests/onboarding-agent-provider-clicks.test.js
  modified:
    - extension/background.js
    - extension/utils/agent-registry.js
    - extension/ws/mcp-tool-dispatcher.js
    - extension/ws/mcp-bridge-client.js
    - extension/ui/onboarding.js
    - tests/lattice-provider-bridge-smoke.test.js

key-decisions:
  - "Keep clientInfo observational: sanitize and persist only bounded name/version strings, with no authorization, cap, ownership, or routing use."
  - "Route registration piggybacks and system:client-inventory frames through the same sibling-preserving installed-map replacement helper."
  - "Resolve onboarding's current client at click time and serialize same-page mutations behind a non-awaited Promise tail so rapid clicks retain every count without changing feedback timing."

patterns-established:
  - "Durable evidence writers replace one normalized sub-map while carrying every other evidence map and unknown envelope sibling forward."
  - "Optional MCP evidence is best-effort: storage failures cannot alter registration responses or clipboard feedback."

requirements-completed: [IDENT-01, IDENT-03, IDENT-04]

# Metrics
duration: 26 min
completed: 2026-07-12
---

# Phase 57 Plan 02: Extension Evidence Persistence Summary

**Durable clicked, connected, and installed MCP-client evidence with sanitized registration identity and zero visible onboarding delta**

## Performance

- **Duration:** 26 min
- **Started:** 2026-07-12T12:38:28Z
- **Completed:** 2026-07-12T13:04:19Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added a serialized `fsbAgentProviders` envelope that survives service-worker eviction while preserving untouched evidence maps and forward-compatible unknown keys.
- Sanitized MCP `clientInfo`, stamped it on live/persisted AgentRecords, and rolled it into non-authoritative connected evidence without changing the exact registration response.
- Converged both installed-inventory delivery paths on one validated replacement operation that never clobbers clicked or connected evidence.
- Persisted onboarding base, fan, and seven-client all-copy intent without awaiting storage or changing clipboard, checkmark, render, toast, HTML, CSS, or manifest contracts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add durable provider evidence storage and live clientInfo stamping** - `495bffd6` (feat)
2. **Task 2: Ingest connected identity and installed inventory through additive bridge paths** - `285ba966` (feat)
3. **Task 3: Persist onboarding copy intent without visible or timing changes** - `daf64e22` (feat)

## Files Created/Modified

- `extension/utils/mcp-agent-providers.js` - Classic-script storage API with normalized reads, serialized sub-map mutations, stable connection rollup, and validated installed replacement.
- `extension/background.js` - Loads the provider-evidence helper after the registry and before MCP dispatcher/bridge consumers.
- `extension/utils/agent-registry.js` - Carries sanitized optional `clientInfo` through live records, clones, persistence, and legacy hydration.
- `extension/ws/mcp-tool-dispatcher.js` - Sanitizes registration identity and best-effort persists connected and piggybacked installed evidence.
- `extension/ws/mcp-bridge-client.js` - Accepts bounded `system:client-inventory` frames through the shared installed replacement helper.
- `extension/ui/onboarding.js` - Records serialized, fire-and-forget copy intent with exact base/fan/all attribution.
- `tests/mcp-agent-providers-storage.test.js` - Covers storage serialization, sibling preservation, registry persistence, sanitization, authorization isolation, and both inventory delivery paths.
- `tests/onboarding-agent-provider-clicks.test.js` - Covers attribution, seven-client expansion, count/timestamp semantics, feedback timing, failure isolation, and frozen UI source hashes.
- `tests/lattice-provider-bridge-smoke.test.js` - Advances paired importScripts source-pin counts for the new classic helper import.

## Decisions Made

- Treat client identity and installed-client data strictly as descriptive evidence; spoofable fields never participate in authority decisions.
- Preserve the exact legacy registration result even when registry or local-storage evidence writes fail.
- Use stable lowercase, whitespace-stripped client names for connected rollups, with version/agent fallbacks only when no name exists.
- Serialize onboarding page writes locally because copy persistence is deliberately non-awaited and repeated rapid clicks must not lose count increments.

## Verification

- `npm --prefix mcp run build` - PASS
- `node tests/agent-scope.test.js` - PASS
- `node tests/mcp-client-identity.test.js` - PASS
- `node tests/mcp-client-inventory.test.js` - PASS
- `node tests/mcp-install-platforms.test.js` - PASS (41 assertions)
- `node tests/mcp-agent-providers-storage.test.js` - PASS
- `node tests/agent-registry.test.js` - PASS
- `node tests/mcp-bridge-background-dispatch.test.js` - PASS (45 assertions)
- `node tests/onboarding-agent-provider-clicks.test.js` - PASS
- `node tests/runtime-contracts.test.js` - PASS (13 assertions)
- `node tests/agent-bridge-routes.test.js` - PASS (32 assertions, extra route regression)
- `npm test` - PASS at committed HEAD `daf64e22` in a detached clean worktree; the main workspace run is blocked only by preserved user-owned deletions of historical planning fixtures.
- Task 1, Task 2, and Task 3 acceptance criteria - PASS
- Frozen SHA-256 contracts - PASS: `onboarding.html` `4c8d3171...`, `onboarding.css` `d23bdd47...`, `manifest.json` `45e49f4f...`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Advanced the paired background import source pins**
- **Found during:** Task 1 acceptance verification
- **Issue:** Importing one required classic helper changed the intentionally exact `importScripts` source counts in the lattice bridge smoke test.
- **Fix:** Advanced the paired source and call-site counts by one without weakening the tripwire.
- **Files modified:** `tests/lattice-provider-bridge-smoke.test.js`
- **Verification:** Direct source-pin checks and the full `npm test` regression pass.
- **Committed in:** `495bffd6`

**2. [Rule 3 - Blocking] Accepted plain objects across VM and Chrome mock realms**
- **Found during:** Task 2 focused storage/bridge verification
- **Issue:** Prototype-identity plain-object checks rejected structurally valid objects created in a separate VM realm.
- **Fix:** Used the realm-safe object tag for durable-envelope validation while retaining array rejection.
- **Files modified:** `extension/utils/mcp-agent-providers.js`
- **Verification:** Focused VM/storage tests and both bridge regressions pass.
- **Committed in:** `285ba966`

**3. [Rule 3 - Blocking] Restored locked test dependencies**
- **Found during:** Wave 1 full-regression verification
- **Issue:** Root, showcase server, and showcase Angular dependency trees were absent, causing missing `lattice`, `better-sqlite3`, and `ng` failures before assertions ran.
- **Fix:** Ran `npm ci`, `npm --prefix showcase/server ci`, and `npm --prefix showcase/angular ci` against existing lockfiles.
- **Files modified:** None tracked; only ignored `node_modules` trees.
- **Verification:** MCP build, all focused tests, nested showcase/server tests, and full regression run successfully.
- **Committed in:** Not committed (local execution environment only).

**4. [Rule 3 - Blocking] Isolated the full regression from unrelated user-owned deletions**
- **Found during:** Wave 1 full-regression verification
- **Issue:** The main workspace intentionally lacks historical Phase 39 planning fixtures, so a late catalog test stopped on `ENOENT` despite all code assertions passing to that point.
- **Fix:** Ran the same `npm test` command in a detached clean worktree at `daf64e22`, reusing locked dependency trees, then removed the temporary worktree. The user-owned deletions were never restored, staged, or modified.
- **Files modified:** None.
- **Verification:** Full `npm test` exited 0 through `no-orphan-descriptor.test.js`.
- **Committed in:** Not committed (verification environment only).

---

**Total deviations:** 4 auto-fixed (4 blocking)
**Impact on plan:** All fixes were required for deterministic verification or paired source contracts. Production scope remained limited to the planned storage and ingestion paths, with no visible UI or permission changes.

## Issues Encountered

None beyond the auto-fixed verification-environment issues documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three durable evidence streams are ready for Plan 57-03's data-only merged view.
- No implementation or verification blockers remain for the next plan.

## Self-Check: PASSED

- All three created implementation/test files and this summary exist on disk.
- Task commits `495bffd6`, `285ba966`, and `daf64e22` exist in git history.
- `requirements-completed` exactly matches `[IDENT-01, IDENT-03, IDENT-04]`.

---
*Phase: 57-agent-identity-capture*
*Completed: 2026-07-12*
