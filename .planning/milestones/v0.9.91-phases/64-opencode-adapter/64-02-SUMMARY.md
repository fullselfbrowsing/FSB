---
phase: 64-opencode-adapter
plan: "02"
subsystem: agent-provider-contract
tags: [topology, attestation, secret-binding, immutability, supervisor]

requires:
  - phase: 64-opencode-adapter
    plan: "01"
    provides: Shared provider ids, protocol-drift error, and closed Claude/OpenCode reason vocabularies
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Exact five-method adapter boundary and serve-owned spawn supervisor
provides:
  - Closed recursively frozen direct and owned-server spawn topology with exact process roles and stream contracts
  - One opaque owned-server Basic-password binding legal only on the server and attach task declarations
  - Ordered process/server JSON attestation descriptors with a closed generic assertion grammar
  - Bounded exact-own-data policy attestation verifier returning only immutable closed verdicts
  - Provider-neutral supervisor drift mapping while production registration remains Claude-only
affects: [64-03, 64-04, 64-07, 64-08, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Reconstruct and freeze every adapter-returned data branch before the supervisor reads it
    - Keep serializable fixed environment separate from supervisor-resolved secret environment bindings
    - Represent lifecycle and runtime substitution with closed topology/role/reference discriminators, never provider callbacks

key-files:
  created:
    - mcp/src/agent-providers/policy-attestation.ts
  modified:
    - mcp/src/agent-providers/adapter.ts
    - mcp/src/agent-providers/spawn-supervisor.ts
    - tests/mcp-agent-provider-contract.test.js
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-claude-code-adapter.test.js
    - tests/mcp-reverse-channel-contract.test.js

key-decisions:
  - "Use `direct` and `owned_server` as the only topology discriminators, with exact direct/server/cold/attach/preflight process roles and one typed owned-server endpoint argument reference."
  - "Make `OPENCODE_SERVER_PASSWORD` plus `owned_server_basic_password` the sole secret-binding pair; raw secret values have no field in the contract and fixedEnv rejects secret-bearing keys and credential-shaped values."
  - "Keep the verifier provider-neutral by interpreting only closed assertion kinds and the single product reference `fsb_mcp_tool_prefix` over defensively copied own-data JSON."
  - "Preserve Claude through a compatibility projection that returns direct topology with byte-identical argv/fixedEnv and empty bindings/attestations."

patterns-established:
  - "Closed spawn grammar: adapters return data only; exact keys, roles, stream modes, bindings, refs, limits, and assertions are reconstructed before recursive freezing."
  - "Opaque secret grammar: the contract can name one supervisor-owned secret reference but cannot carry, resolve, log, fingerprint, or serialize its value."
  - "Generic attestation grammar: process_json and owned_server_json descriptors share ordered assertions and bounded limits; only the supervisor may later execute probes."

requirements-completed: [MULTI-01, MULTI-03]

duration: 27 min
completed: 2026-07-20
---

# Phase 64 Plan 02: Closed Topology and Attestation Contract Summary

**A recursively frozen provider-neutral topology, opaque spawn-secret binding, and bounded own-data attestation verifier now extend the exact five-method adapter boundary without registering or launching OpenCode.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-20T19:19:58Z
- **Completed:** 2026-07-20T19:47:13Z
- **Tasks:** 1 TDD task
- **Files modified:** 7 implementation/test files

## Accomplishments

- Replaced the public flat `SpawnSpec` output with exact direct/owned-server topology data containing one process per declared role, bounded readiness/idle policies, and closed supervisor endpoint/generation references.
- Added `SpawnSecretEnvBinding` as a separate frozen array whose only legal entry is `{envKey:'OPENCODE_SERVER_PASSWORD', secretRef:'owned_server_basic_password'}` and whose placement is limited to the owned server and attach task.
- Added ordered `process_json` and authenticated `owned_server_json` descriptors with exact byte/time bounds, safe server paths, preflight roles, and the seven reviewed assertion kinds.
- Added a generic verifier that rejects accessors, inherited records, sparse arrays, cycles, malformed JSON data, unbounded input, arbitrary assertions, string exact scalars, and free-form prefixes while returning only frozen pass/closed-reason verdicts.
- Moved supervisor typed-drift recognition to `protocol-drift.ts`, generalized its closed reason mapping, and made it defensively freeze adapter-returned specs before reading direct process data.
- Preserved Claude command, argv order (including intentional empty values), cwd, private files, and fixed environment exactly under direct topology with no secret binding or attestation.

## Task Commits

The TDD task was committed in two atomic boundaries:

1. **RED — define the closed topology, binding, attestation, mutation, and supervisor source contract** — `e1e616fe` (test)
2. **GREEN — implement the frozen contract, verifier, direct supervisor projection, and compatibility repairs** — `ce19337c` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/adapter.ts` — Closed process roles, direct/owned topology, runtime refs, exact secret binding, attestation union, defensive validation, and recursive freezing.
- `mcp/src/agent-providers/policy-attestation.ts` — Bounded own-data JSON copier plus exact generic assertion interpreter and frozen verdicts.
- `mcp/src/agent-providers/spawn-supervisor.ts` — Shared protocol-drift import/mapping and defensive direct-topology process selection; no secret resolution or owned-server execution was added.
- `tests/mcp-agent-provider-contract.test.js` — Exact five methods, topology/binding placement, all assertion kinds, deep mutation, accessor/prototype/sparse-input, confidentiality, and source gates.
- `tests/mcp-spawn-supervisor.test.js` — Direct topology fixtures and shared protocol-drift construction.
- `tests/mcp-claude-code-adapter.test.js` — Direct-topology projection assertions over the unchanged Claude argv/env policy.
- `tests/mcp-reverse-channel-contract.test.js` — Shared drift-module import contract replacing the stale provider-parser pin.

## Decisions Made

- Chose exact role values `direct_task`, `owned_server`, `cold_task`, `attach_task`, and `policy_preflight` so stream/binding/runtime-reference placement is mechanically validated without inspecting adapter id.
- Represented the attach endpoint as the sole typed runtime argument `{runtimeRef:'owned_server_endpoint'}`; no free-form interpolation/template or resolver is accepted.
- Required exact insertion-order keys for `exact_keys` and canonical own-data JSON serialization for `document_sha256`, preserving order-sensitive permission evidence.
- Made `all_strings_prefix` non-vacuous and bound it only to the closed product reference `fsb_mcp_tool_prefix`; arbitrary prefixes cannot enter descriptors.
- Kept owned-server execution, password minting/resolution, authenticated HTTP construction, and OpenCode production registration out of this plan as locked for Plans 07, 08, and 05 respectively.

## TDD Evidence

- **RED:** the exact Plan 02 workspace-preserving command built the existing MCP tree, then failed because `mcp/build/agent-providers/policy-attestation.js` did not exist.
- **GREEN:** the same command passed `mcp-agent-provider-contract` and `mcp-spawn-supervisor`, including source, TypeScript, compiled boundary, and workspace identity checks.
- The Claude adapter regression passed with byte-identical argv/fixedEnv under direct topology.
- The Plan 01 OpenCode parser/fixture/drift command remained green after the contract change.
- The complete guarded Phase 60/root regression suite passed after the documented reversible generated-file stat-refresh mitigation.

## Security and Privacy

- No raw Basic password field, arbitrary environment key/ref, callback, resolver, function, template, header, or secret value is representable in the binding grammar.
- `fixedEnv` rejects the exact password key, secret-bearing environment names, and common credential/header value shapes; server and attach bindings retain only the opaque supervisor reference.
- Direct, cold, and policy-preflight processes require empty binding arrays; runtime endpoint substitution is legal only on the attach task.
- Every nested adapter value is read through own data descriptors, exact-key checked, defensively copied, bounded, and frozen; accessors are rejected without invocation.
- The verifier copies only finite, dense, cycle-free own-data JSON and discards it after producing a frozen verdict with no adapter id, source body, model value, task, password, or arbitrary error text.
- The supervisor imports no OpenCode module, compares no OpenCode adapter id, resolves no secret, and retains exactly the existing five adapter methods.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migrated the existing Claude profile regression to the new direct topology**

- **Found during:** Post-GREEN Claude compatibility verification.
- **Issue:** `tests/mcp-claude-code-adapter.test.js` still read the removed flat `SpawnSpec` fields, and the new argument validator initially rejected Claude's reviewed literal empty values following `--setting-sources` and `--tools`.
- **Fix:** Allowed bounded empty argv elements, retained every byte/order invariant, and moved the existing assertions to `spec.topology.task` with explicit empty binding/attestation checks.
- **Files modified:** `mcp/src/agent-providers/adapter.ts`, `tests/mcp-claude-code-adapter.test.js`.
- **Verification:** Guarded `mcp-claude-code-adapter.test.js` and the full regression suite passed.
- **Committed in:** `ce19337c`.

**2. [Rule 1 - Bug] Refreshed the stale reverse-channel drift import assertion**

- **Found during:** First guarded full-suite run.
- **Issue:** The source contract still required `AgentProtocolDriftError` to be imported from `claude-stream.ts`, contradicting Plan 02's provider-neutral `protocol-drift.ts` boundary.
- **Fix:** Pinned the shared import structurally and added a negative assertion against provider-parser imports.
- **Files modified:** `tests/mcp-reverse-channel-contract.test.js`.
- **Verification:** Its focused guarded test and the full regression suite passed.
- **Committed in:** `ce19337c`.

**3. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** First guarded full-suite run.
- **Issue:** The outer workspace-preservation wrapper again observed the known generated-file stat refresh after the inner gate, matching Plan 01's documented environmental interference class.
- **Fix:** Temporarily marked only the same seven proven-clean generated entries assume-unchanged under an exit trap, reran the exact guarded suite, then removed every flag.
- **Files modified:** None; temporary local index flags only, all reverted to ordinary `H` state.
- **Verification:** Both `[phase60-full-tests] PASS` and `[mcp-build-preserver] PASS` completed; scoped staged state remained empty.
- **Committed in:** n/a.

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking environmental condition).
**Impact on plan:** The fixes preserve the intended contract and existing regressions without adding OpenCode lifecycle, secret, registry, or provider-specific supervisor authority.

## Issues Encountered

- TypeScript required the recursive JSON value definition to use recursive interfaces rather than a `Readonly<Record<...>>` alias; the representation and runtime behavior were unchanged.
- The first full-suite run stopped at the stale reverse-channel source assertion before the known outer index-stat warning; both conditions were corrected and the full suite then passed.

## User Setup Required

None - no dependency, service, credential, or local configuration was added.

## Verification

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-agent-provider-contract.test.js"],["node","tests/mcp-spawn-supervisor.test.js"]]'` — PASS after `ce19337c`.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","first-commit-drift-gate"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` — PASS.
- Guarded focused bundle for provider contract, spawn supervisor, and Claude adapter — PASS.
- Guarded `mcp-reverse-channel-contract.test.js` — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with inner full-suite and outer workspace-preservation gates green after reversible stat mitigation.
- Source/compiled native-host boundary checks, forbidden provider flags, TypeScript build, exact five-method scan, no OpenCode supervisor import/id branch, and `git diff --check` — PASS.

## Next Phase Readiness

- Plan 03 can add role-aware journal schemas against the exact process/topology data without persisting bindings or resolved environment.
- Plan 04 can populate OpenCode cold/server/attach/preflight and attestation declarations using the closed grammar.
- Plan 07 remains the sole authorized owner of password minting, secret-store resolution, server/attach spawn-time env overlay, health authentication, and lease lifecycle.
- Plan 08 remains the sole authorized owner of executing process/server probes and feeding discarded JSON documents into `verifyPolicyAttestation`.
- OpenCode is still absent from the production registry and compatibility matrix, as required until Plan 05.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
