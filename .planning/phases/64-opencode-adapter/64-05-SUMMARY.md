---
phase: 64-opencode-adapter
plan: "05"
subsystem: agent-provider-production-exposure
tags: [opencode, adapter-registry, compatibility-matrix, fixture-drift, atomic-exposure]

requires:
  - phase: 64-opencode-adapter
    plan: "01"
    provides: Exact OpenCode 1.14.25 parser, committed fixture, native negatives, and first-commit CI drift gate
  - phase: 64-opencode-adapter
    plan: "04"
    provides: Retained OpenCode detector and hermetic profile/topology declarations
provides:
  - Production OpenCode adapter composition behind the unchanged exact five-method interface
  - Exact required Claude Code/OpenCode registry order with closed immutable registration validation
  - Exact OpenCode 1.14.25 compatibility row bound to the committed native fixture contract
  - Mechanical registry/matrix/parser/manifest/production-adapter bijection with Codex absent
affects: [64-06, 64-07, 64-08, 64-09, 64-10, 64-11, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Compose provider implementations from injected detector, profile, parser, and supervisor-owned tree-kill authority
    - Promote a provider only when registry, matrix, parser, fixture manifest, and drift rosters become exact together
    - Preserve exact-version spawn eligibility while newer same-major versions remain observationally degraded

key-files:
  created:
    - mcp/src/agent-providers/opencode.ts
  modified:
    - mcp/src/agent-providers/registry.ts
    - mcp/src/agent-providers/compatibility.ts
    - tests/mcp-agent-provider-contract.test.js
    - tests/mcp-opencode-adapter.test.js
    - tests/mcp-adapter-compatibility.test.js
    - tests/mcp-agent-drift-smoke.test.js
    - tests/delegation-phase-contract.test.js
    - tests/mcp-version-parity.test.js

key-decisions:
  - "Expose OpenCode through exactly detect/buildSpawn/parseEvents/kill/caps, with deeply frozen task/server-only capabilities and no local process, filesystem, HTTP, secret, or timer authority."
  - "Require the production roster in exact Claude Code then OpenCode order; reject missing, duplicate, unknown, case-varied, mutable, sparse, accessor, and non-data registrations while keeping Codex absent."
  - "Bind OpenCode compatibility to exact profile/minimum/tested-through 1.14.25 and the committed native/normalized fixture contract without widening exact-only spawn eligibility."
  - "Keep all seven production/composition/registry/matrix/drift paths in one implementation commit; repair proven stale historical assertions only in separate test-only commits."

patterns-established:
  - "Atomic provider exposure: no production registry state exists without its matrix, parser, fixture, manifest, and native-negative drift evidence."
  - "Closed composition: the concrete adapter owns no authority beyond calling reviewed injected dependencies and returning recursively immutable capabilities."
  - "Exact roster parity: production registry, compatibility rows, parser contracts, committed manifests, and concrete adapter modules are compared as ordered identities, not inferred from counts."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 41 min
completed: 2026-07-20
---

# Phase 64 Plan 05: Atomic OpenCode Production Exposure Summary

**OpenCode 1.14.25 is now the second required production adapter, promoted in one atomic implementation commit with its exact compatibility row and complete registry/matrix/parser/fixture/manifest drift bijection.**

## Performance

- **Duration:** 41 min
- **Started:** 2026-07-20T21:13:17Z
- **Completed:** 2026-07-20T21:54:01Z
- **Tasks:** 1 atomic TDD task
- **Files modified:** 7 atomic implementation/test paths plus 2 separate historical regression-maintenance tests

## Accomplishments

- Added `createOpenCodeAdapter` as an exact five-method frozen composition over the retained detector, hermetic profile/spawn builder, strict event parser, injected tree killer, and deeply frozen `{taskMode:true, chatMode:false, resume:false, serverMode:true}` capabilities.
- Expanded the closed production registry to require exactly `claude-code` then `opencode`, including exact dense data validation and rejection of missing, duplicate, unknown, case-varied, mutable, accessor-bearing, sparse, or out-of-order registrations.
- Added the exact OpenCode 1.14.25 compatibility row with its display label, version bounds, supported major, task/server-only capabilities, committed fixture path, dotted native evidence fields, and normalized event sequence.
- Strengthened production drift coverage to compare registry ids, matrix ids, parser-contract ids, committed manifest ids, and concrete production adapter ids as one exact ordered Claude/OpenCode bijection while rejecting Codex.
- Routed both committed fixtures only through their registered production parsers and retained every positive, malformed, and provider-native negative mutation from the first implementation gate.
- Preserved the exact-only compatibility detector used for spawn authorization; same-major releases newer than 1.14.25 remain degraded observations rather than eligible spawn profiles.

## Task Commits

The planned production task landed in the required single atomic implementation boundary:

1. **Atomic OpenCode adapter, registry, matrix, and drift exposure** — `b04e97df` (feat; exactly the seven planned paths)

Two proven stale pre-exposure assertions discovered by affected/full-suite regression runs were updated only after the atomic commit, in separate test-only boundaries explicitly authorized during execution:

2. **Update historical atomic adapter exposure contract** — `3646673c` (test; `tests/delegation-phase-contract.test.js` only)
3. **Update historical production registry parity** — `623cb593` (test; `tests/mcp-version-parity.test.js` only)

## Files Created/Modified

- `mcp/src/agent-providers/opencode.ts` — Exact five-method OpenCode production composition and deeply frozen capabilities.
- `mcp/src/agent-providers/registry.ts` — Closed two-adapter identity/order validation and production Claude/OpenCode construction.
- `mcp/src/agent-providers/compatibility.ts` — Exact OpenCode 1.14.25 matrix row and closed two-row matrix parsing.
- `tests/mcp-agent-provider-contract.test.js` — Exact production registry identities, order, immutability, rejection cases, and composition boundaries.
- `tests/mcp-opencode-adapter.test.js` — Atomic composition/capability assertions and the retained pre/post first-commit drift gate.
- `tests/mcp-adapter-compatibility.test.js` — Exact OpenCode row, native fields, normalized sequence, and non-widened eligibility cases.
- `tests/mcp-agent-drift-smoke.test.js` — Complete production roster bijection and registered-parser replay for both fixtures.
- `tests/delegation-phase-contract.test.js` — Historical meta-contract updated from Phase 62 non-exposure to exact atomic OpenCode exposure.
- `tests/mcp-version-parity.test.js` — Historical Claude-only registry pin updated to exact Claude/OpenCode composition with Codex absent.

## Decisions Made

- Kept the adapter composition deliberately thin: `detect` invokes the reviewed retained detector, `buildSpawn` derives the reviewed private runtime profile and spawn specification, `parseEvents` delegates to the strict Plan 01 parser, and `kill` delegates to the injected supervisor tree killer.
- Made missing OpenCode runtime resolution fail closed at `buildSpawn` while allowing registry consumers that only need detection or parsing to construct the production registry before Plan 07 supplies runtime-owned resolution.
- Returned the canonical frozen capability object directly; neither the adapter nor the registry can mutate or derive capabilities from provider output.
- Closed matrix parsing over the exact two canonical ordered rows and exact per-adapter capabilities. Dotted native fields remain literal evidence paths rather than executable selectors.
- Kept Codex absent from the concrete adapter module, production registry, compatibility matrix, fixture contracts, and drift roster. The existing Providers UI row does not authorize production registration.

## TDD Evidence

- **Pre-edit gate:** the exact Plan 01 parser/fixture/drift command passed before any production edit, with OpenCode still absent from the production registry and compatibility matrix.
- **RED:** the complete exposure assertions were added to all four owned test files and intentionally left uncommitted; the exact Plan 05 command failed with `AdapterRegistryError: Unknown adapter id` when the contract required OpenCode registration.
- **GREEN:** the same exact Plan 05 command passed only after adapter composition, registry exposure, matrix exposure, and the complete drift bijection were implemented together.
- **Atomic history:** `b04e97df` contains exactly the seven planned paths (`774 insertions`, `52 deletions`) and no registry-only, matrix-only, drift-only, or RED-only intermediate commit exists.
- **Post-edit gate:** the exact Plan 01 first-commit drift command passed again with both registered production parsers replaying the committed Claude/OpenCode fixtures.
- Plans 02-04 provider/supervisor/runtime/profile/attestation, Claude adapter, reverse-channel, bridge-topology, diagnostics, client inventory, storage, historical contract, and version-parity regressions all passed through the workspace-preserving builder.
- The complete guarded root suite exited 0 with `[phase60-full-tests] PASS`, `[mcp-build-preserver] PASS`, and a successful post-mitigation restoration check.

## Security and Privacy

- `opencode.ts` imports no process creation, filesystem, HTTP/network, crypto/random, timer, environment, or secret-resolution authority. It cannot spawn, read/write files, fetch, connect, inspect environment variables, mint credentials, or schedule work.
- Termination remains solely supervisor-owned: the adapter forwards the supervised child and grace policy to the injected tree killer and contains no PID lookup, process discovery, or signal logic.
- Registry parsing accepts only exact immutable five-method data objects for the two canonical ids. Unknown/case-varied ids, plugin discovery, Codex, sparse arrays, accessors, inherited objects, duplicates, omissions, and order changes fail closed.
- Compatibility evidence is pinned to exact 1.14.25 profile/fixture/native/normalized fields. No newer release becomes spawn-eligible merely because it is same-major or classifiable as degraded.
- Drift fixtures remain sanitized, schema-derived, offline, and `liveCapturePending: true`; no provider binary, account, browser, credential, network, prompt, task, raw body, or live-capture claim enters automated evidence.
- Source scans found no raw password, Basic header, API key, credential, task, prompt, provider-native body, or Codex production authority in the adapter/registry/matrix boundary.
- Every applicable HIGH/CRITICAL threat is mechanically mitigated; none was accepted. Live authenticated provider behavior remains pending milestone-end human UAT.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated the stale Phase 62 non-exposure meta-contract after the atomic commit**

- **Found during:** Affected historical regression verification after `b04e97df`.
- **Issue:** `tests/delegation-phase-contract.test.js` had eight assertions that intentionally froze the old Phase 62/Plan 01 state: one Claude-only matrix row, no OpenCode adapter file, direct unregistered OpenCode parser loading, and production rejection of `opencode`.
- **Fix:** With explicit execution-time authorization, updated only that historical test to require exact Claude/OpenCode order, exact OpenCode 1.14.25 matrix/capability fields, registered-parser replay, exact five-method composition, and Codex absence.
- **Files modified:** `tests/delegation-phase-contract.test.js` only.
- **Verification:** `1047 passed, 0 failed`; full guarded suite green.
- **Committed in:** `3646673c`.

---

**2. [Rule 3 - Blocking] Updated the second proven stale Claude-only version-parity pin**

- **Found during:** Adjacent version-parity regression verification after the first maintenance commit.
- **Issue:** `tests/mcp-version-parity.test.js` still regex-pinned `CANONICAL_IDS` to a single Claude Code entry even though Plan 05 requires exact two-adapter exposure.
- **Fix:** With explicit execution-time authorization, replaced only that assertion with exact canonical Claude/OpenCode order, exact concrete composition, and Codex-import/id/factory absence while preserving all other historical parity invariants.
- **Files modified:** `tests/mcp-version-parity.test.js` only.
- **Verification:** `148 passed, 0 failed`; historical contract remained `1047 passed, 0 failed`; full guarded suite green.
- **Committed in:** `623cb593`.

---

**3. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Final guarded repository-wide verification.
- **Issue:** The inner root suite completed through green tests, but the outer frozen wrapper observed the known external Git stat-refresh interference on seven content-clean generated entries.
- **Fix:** Proved each candidate clean in worktree and staged diffs, object-identical to the index, and ordinary tracked before temporarily marking exactly those seven entries assume-unchanged under EXIT/INT/TERM restoration. The pre-existing dirty `mcp/build/index.js` was explicitly excluded and hash-protected.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** The exact guarded suite exited 0; both preservation markers passed; postcheck reported `suite=0 postcheck=0`, all seven entries returned to ordinary `H` and remained index-identical, the dirty index build file retained its bytes, and the compatibility path returned to its required absent state.
- **Committed in:** n/a.

---

**Total deviations:** 3 auto-fixed blocking regression/environmental conditions.
**Impact on plan:** The required seven-path implementation remained one atomic commit. Both source-test corrections were isolated, explicitly authorized, test-only maintenance commits; no additional production, matrix, fixture, wrapper, generated, or UI scope was added.

## Issues Encountered

- One affected-regression command initially named a nonexistent `mcp-agent-spawn-supervisor.test.js`; the completed Plan 02 record identified the correct `mcp-spawn-supervisor.test.js`, and the corrected complete regression roster passed.
- A detached full-suite output stream overlapped briefly with the harness-owned Phase 39 compatibility symlink. The process was left untouched to complete its cleanup, the path was proven absent with no process remaining, and the final exact run used a persistent session that captured exit 0 and every restoration marker.

## User Setup Required

None - no dependency, service, credential, account, browser, or local configuration was added.

## Verification

- Exact pre-edit and post-edit Plan 01 gate — PASS.
- Exact Plan 05 provider/composition/compatibility/drift command — PASS.
- Plans 02-04 provider contract, spawn supervisor, orphan recovery, detection, profile policy, attestation, forbidden flags, Claude adapter, reverse channel, and bridge topology — PASS.
- Historical delegation contract — `1047/1047 passed`.
- Version parity — `148/148 passed`.
- Diagnostics — `229/229 passed`; client inventory and agent-provider storage — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with inner full-suite and outer workspace-preservation markers green.
- Scoped `git diff --check`, owned-path clean status, exact commit path roster, restored index flags, object-identity checks, forbidden-authority scan, forbidden-secret scan, and Codex-absence scan — PASS.

## Next Phase Readiness

- Plan 06 can project the exact two-adapter registry/matrix contract into local inventory, doctor, and browser-safe compatibility views without inventing roster or version authority.
- Plans 07-08 can supply runtime-owned OpenCode profile resolution and transient secret materialization to the already-exposed adapter through the generic supervisor boundary.
- Plans 09-12 can build result projection and provider-neutral UI behavior against a stable production adapter identity.
- Live OpenCode account/default-model/server/delegation evidence remains pending the milestone-end human UAT sweep.
- No active blocker.

## Self-Check: PASSED

- All nine declared implementation and regression-maintenance files plus this summary exist.
- Atomic implementation commit `b04e97df` contains exactly the seven planned paths; maintenance commits `3646673c` and `623cb593` each contain only their declared historical test.
- Exact Plan 01/05 commands, all affected regressions, the complete guarded root suite, workspace preservation, restored index flags, protected dirty bytes, and scoped source/security checks pass.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
