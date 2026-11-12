---
phase: 64-opencode-adapter
plan: "03"
subsystem: agent-provider-runtime
tags: [runtime-journal, orphan-recovery, private-artifacts, opencode, secret-non-retention]

requires:
  - phase: 64-opencode-adapter
    plan: "02"
    provides: Closed provider-neutral topology, exact process roles, fixed environment, and opaque secret-binding grammar
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Version-1 Claude runtime journal, retained process identity, and fail-closed orphan recovery
provides:
  - Exact version-2 runtime journal with closed delegation and provider_server roles
  - Read-only version-1 Claude normalization to delegation without rewriting legacy journal bytes
  - Closed MCP/OpenCode private-artifact graph with 0700 directories, 0600 files, containment, and fail-closed cleanup
  - Role-specific recovery accounting that records lost work only for confirmed stale delegations
  - Fixed-env-only durable state with structural rejection of secret bindings, resolved environment, credentials, and headers
affects: [64-04, 64-05, 64-07, 64-08, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Persist public process identity and fixed environment only; infer cleanup paths from closed role/adapter state
    - Validate the complete private-artifact graph before any filesystem mutation or removal
    - Normalize legacy records in memory while preserving their exact on-disk bytes until a real mutation is required

key-files:
  created: []
  modified:
    - mcp/src/agent-providers/runtime-files.ts
    - tests/mcp-agent-orphan-recovery.test.js
    - tests/mcp-agent-provider-contract.test.js

key-decisions:
  - "Use `delegation` and `provider_server` as the only durable runtime roles; provider-server cleanup never fabricates a daemon-restart lost-run disposition."
  - "Keep journal version 2 exact and fixed-env-only, while parsing exact version-1 Claude records into an in-memory delegation projection without rewriting their bytes on read."
  - "Represent private runtime inputs with the four closed logical kinds `mcp_config`, `opencode_config`, `opencode_test_home`, and `opencode_managed_config`, then derive every path inside the minted run directory."
  - "Prevalidate the complete expected artifact graph, ownership shape, containment, symlink status, and modes before cleanup so partial or foreign state fails closed."

patterns-established:
  - "Role-aware durability: task work and daemon infrastructure share one exact journal but retain distinct recovery accounting."
  - "Closed artifact authority: callers select reviewed logical artifacts and contents; runtime-files alone derives, writes, validates, and removes physical paths."
  - "Secret non-retention: durable records cannot represent spawn bindings, resolved environments, raw credentials, authorization headers, or credential-bearing values."

requirements-completed: [MULTI-01, MULTI-03]

duration: 32 min
completed: 2026-07-20
---

# Phase 64 Plan 03: Role-Aware Runtime Journal Summary

**A backward-compatible version-2 runtime journal now separates delegation children from daemon-owned provider servers while keeping OpenCode private artifacts contained and transient credentials structurally absent from durable state.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-07-20T19:53:15Z
- **Completed:** 2026-07-20T20:24:48Z
- **Tasks:** 1 TDD task
- **Files modified:** 3 implementation/test files

## Accomplishments

- Versioned the journal from 1 to 2 with exact `delegation` and `provider_server` roles while preserving the legacy Claude prepare/activate/remove call surface and exact version-1 read bytes.
- Added closed role-aware prepare, activate, remove, and recovered-run removal paths that retain only adapter/profile/generation/executable/argv/fixedEnv and proven process identity.
- Added the reviewed OpenCode runtime graph: private config root/file, private test home, and managed config directory alongside the existing private MCP config.
- Enforced containment, exact graph membership, dense own-data inputs, 0700 directory modes, 0600 file modes, atomic writes, and refusal on traversal, symlinks, foreign nodes, unsafe modes, or incomplete graphs.
- Made startup recovery disposition-aware: confirmed stale delegations record `daemon_restart_lost_run`, confirmed stale provider servers are cleaned as infrastructure, and ambiguous or mismatched identities remain durable without signaling.
- Added structural secret canaries across inputs, journal bytes, recovery results, and private files so password bindings, resolved spawn environments, Authorization headers, endpoint credentials, and raw secret values cannot cross the boundary.

## Task Commits

The TDD task was committed in two atomic boundaries:

1. **RED — define the role-aware journal, private-artifact, secret, and recovery contract** — `e4ab9fb6` (test)
2. **GREEN — implement version-2 durability, artifact containment, and role-specific recovery** — `6119fad0` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/runtime-files.ts` — Version-2 parser/writer, legacy projection, role-aware lifecycle APIs, closed private-artifact materialization/validation, and recovery accounting.
- `tests/mcp-agent-orphan-recovery.test.js` — Version/role matrix, legacy byte preservation, OpenCode path/mode/containment checks, secret sentinels, cleanup refusal, and role-specific zero-kill recovery cases.
- `tests/mcp-agent-provider-contract.test.js` — Source boundary proving journal-before-spawn and activation ordering while forbidding OpenCode branches/imports in the generic supervisor.

## Decisions Made

- Kept `delegationId` as the bounded durable record identifier for both roles so the existing serialized journal machinery remains compatible; the exact `role` now determines cleanup and lost-work semantics.
- Allowed `provider_server` only for the reviewed OpenCode adapter, while legacy string-form removal remains delegation-only and role-aware removal requires an exact `{delegationId, role}` pair.
- Stored artifact descriptions only at prepare time. The journal retains no file contents, arbitrary paths, or cleanup list; later cleanup reconstructs the exact graph from the validated adapter/role and fixed environment.
- Required OpenCode fixed environment to point exactly at the runtime-owned config, test-home, and managed-config locations. Credential-bearing environment keys and common Basic/Bearer/credential URL shapes are rejected even when hidden under otherwise public fields.
- Preserved the Phase 60 recovery rule that signaling requires exact retained executable, start-time, group/tree, generation, and platform evidence. The new role never expands process discovery or kill authority.

## TDD Evidence

- **RED:** the exact Plan 03 command failed at the newly required version-2 export before production changes were made; the test-only boundary was committed as `e4ab9fb6`.
- **GREEN:** the same command passed both `mcp-agent-orphan-recovery.test.js` and `mcp-agent-provider-contract.test.js` after `6119fad0`.
- Plan 01 parser/fixture/native-drift regressions, Plan 02 provider/supervisor regressions, Claude adapter compatibility, and reverse-channel source contracts all passed through the workspace-preserving build wrapper.
- The complete guarded Phase 60/root regression suite passed with both the inner full-suite preservation marker and the outer MCP-build workspace-identity marker green.

## Security and Privacy

- Journal exact-key parsing rejects unknown roles, fields, adapter/role pairings, paths, private-artifact inputs, secret-binding records, resolved environment records, credential fields, and authorization material.
- Durable `fixedEnv` accepts only bounded public data and rejects `OPENCODE_SERVER_PASSWORD`, secret-bearing key names, Basic/Bearer values, credential URLs, header-shaped objects, raw bytes, accessors, inherited records, sparse arrays, and cycles.
- Private files are atomically created with mode 0600 beneath directories created with mode 0700. Cleanup validates the entire exact graph before deleting anything and refuses symlinks, foreign files, extra children, unsafe modes, or paths outside the minted runtime root.
- Recovery never discovers a user OpenCode process. Only an identity-confirmed retained FSB process tree may receive a signal; ambiguous and identity-mismatched records remain fail-closed and withhold capability advertisement.
- Provider-server cleanup produces no user-work loss record, preventing daemon infrastructure from being misreported as an interrupted delegation.
- Live kernel/process identity behavior remains part of the milestone-end UAT surface; no live pass is inferred from deterministic tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Final guarded repository-wide verification.
- **Issue:** The inner full suite passed, but the outer wrapper observed the known Git index stat-refresh interference on seven generated entries despite their content and staged diffs being clean.
- **Fix:** Temporarily marked only those seven proven-clean generated entries assume-unchanged under an EXIT/INT/TERM trap, reran the exact guarded suite, and restored every entry to ordinary tracked state.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** Both `[phase60-full-tests] PASS` and `[mcp-build-preserver] PASS` completed; all seven entries report ordinary `H`, scoped diffs remain empty, and unrelated dirty state is preserved.
- **Committed in:** n/a.

---

**Total deviations:** 1 auto-fixed blocking environmental condition.
**Impact on plan:** No implementation, test, generated file, or repository wrapper was changed; the exact planned runtime boundary and verification scope were preserved.

## Issues Encountered

- The first full-suite invocation proved every inner test green but stopped at the outer raw-index identity check because of the known generated-file stat refresh. The reversible scoped rerun resolved only that environmental interference and passed both layers.

## User Setup Required

None - no dependency, service, credential, or local configuration was added.

## Verification

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-orphan-recovery.test.js"],["node","tests/mcp-agent-provider-contract.test.js"]]'` — PASS.
- Plan 01 guarded parser/fixture/drift bundle — PASS.
- Plan 02 guarded provider-contract/spawn-supervisor bundle — PASS.
- Guarded Claude adapter and reverse-channel regressions — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with inner full suite and outer workspace preservation green after the reversible stat mitigation.
- `git diff --check`, scoped owned-path status, restored index-flag scan, source hygiene scan, forbidden-secret scan, and generic-supervisor OpenCode authority scan — PASS.

## Next Phase Readiness

- Plan 04 can declare the exact OpenCode 1.14.25 fixed environment and private artifacts against this closed runtime API without gaining arbitrary filesystem or secret authority.
- Plan 07 can journal the owned server before spawn, activate it only after process identity is known, and clean it without fabricating lost delegation work.
- Transient password minting/resolution and spawn-time environment overlay remain exclusively deferred to Plan 07; production OpenCode registry/compatibility exposure remains deferred to Plan 05.
- No active blocker.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
