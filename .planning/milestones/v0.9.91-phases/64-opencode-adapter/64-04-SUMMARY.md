---
phase: 64-opencode-adapter
plan: "04"
subsystem: agent-provider-profile
tags: [opencode, detection, hermetic-config, policy-attestation, secret-binding]

requires:
  - phase: 64-opencode-adapter
    plan: "01"
    provides: Exact OpenCode 1.14.25 parser fixture and native drift gate
  - phase: 64-opencode-adapter
    plan: "02"
    provides: Closed provider-neutral topology, spawn-secret binding, and generic attestation grammar
  - phase: 64-opencode-adapter
    plan: "03"
    provides: Closed private-artifact kinds and role-aware fixed-env-only runtime journal
provides:
  - Exact OpenCode 1.14.25 retained-binary detection with bounded diagnostics and unknown auth state
  - Private XDG/project/home/managed isolation with a pinned fsb agent, loopback MCP, default model, and ordered default-deny policy
  - Declarative cold, owned-server, attach, preflight, and policy-attestation specifications
  - Exact opaque password binding placement on owned-server and attach processes only
affects: [64-05, 64-06, 64-07, 64-08, 64-11, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Retain and recheck one real executable identity before accepting an exact native profile version
    - Derive private provider configuration from closed runtime paths without inheriting project, home, model, or credential state
    - Describe provider-native evidence with generic bounded assertions rather than callbacks or supervisor branches

key-files:
  created:
    - mcp/src/agent-providers/opencode-detect.ts
    - mcp/src/agent-providers/opencode-profile.ts
  modified:
    - tests/mcp-opencode-adapter.test.js
    - tests/agent-provider-forbidden-flags.test.js

key-decisions:
  - "Accept only OpenCode 1.14.25 after a shell-free bounded version probe and retained-realpath recheck; detection deliberately leaves account state unknown."
  - "Use private XDG config, test-home, and managed-config roots while disabling project config, external skills, inherited Claude prompts, auto-update, and LSP downloads; do not override the native default model."
  - "Pass task text only through stdin and place the sole opaque `owned_server_basic_password` binding only on the owned server and selected attach child."
  - "Keep policy evidence as four closed generic descriptors interpreted by the shared verifier; export no OpenCode checker, callback, extra adapter method, supervisor hook, reducer, or selector."

patterns-established:
  - "Exact retained detection: fixed native candidate names, bounded shell-free probing, exact profile pin, and identity revalidation close executable substitution races."
  - "Hermetic native policy: private configuration and ordered default deny isolate provider authority while preserving only native authentication and default-model selection."
  - "Declarative attestation: bounded process and owned-server evidence share one provider-neutral assertion grammar and never retain raw bodies, passwords, or Authorization headers."

requirements-completed: [MULTI-02]

duration: 36 min
completed: 2026-07-20
---

# Phase 64 Plan 04: OpenCode Detection and Hermetic Policy Summary

**OpenCode 1.14.25 now has an exact retained-binary detector and a private, default-deny fsb profile whose cold/server/attach and effective-policy boundaries are fully declarative and secret-value-free.**

## Performance

- **Duration:** 36 min
- **Started:** 2026-07-20T20:31:27Z
- **Completed:** 2026-07-20T21:06:58Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 4 implementation/test files

## Accomplishments

- Added fixed native executable discovery for POSIX and Windows, retained real-path identity, bounded shell-free `--version` probing, race rechecks, exact 1.14.25 acceptance, and bounded unavailable diagnostics with authentication intentionally reported as unknown.
- Built exact private OpenCode artifacts for XDG config, test home, and managed config, with project configuration, external skills, inherited Claude prompts, auto-update, and LSP downloads disabled and no inherited HOME/data/state/cache or model override.
- Declared the pinned primary `fsb` agent from the shipped policy, one private loopback FSB MCP, sharing disabled, task-only stdin, and ordered permission rules that deny all authority before the final resolved `fsb_*` allow.
- Declared cold run, owned server, and attach process specifications plus four bounded generic policy descriptors for debug config, debug agent, owned `/config`, and owned `/agent` evidence.
- Restricted `OPENCODE_SERVER_PASSWORD` to the opaque `owned_server_basic_password` binding on the owned server and attach child only; no password value, header value, API key, task, or model is serialized into profile data.
- Kept the production registry and compatibility matrix Claude-only, preserving the atomic OpenCode exposure boundary for Plan 05.

## Task Commits

Each TDD task was committed in separate RED and GREEN boundaries:

1. **RED — define retained OpenCode detection contract** — `29b73227` (test)
2. **GREEN — implement exact retained OpenCode detection** — `e9e66dc4` (feat)
3. **RED — define hermetic OpenCode profile contract** — `43d08afa` (test)
4. **GREEN — declare private OpenCode profile and spawn topology** — `2a56f261` (feat)
5. **RED — define generic attestation and forbidden-source contract** — `c6e1c5b6` (test)
6. **GREEN — declare bounded generic OpenCode attestations** — `c974add2` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/opencode-detect.ts` — Fixed-name native discovery, retained executable identity, exact version probe, Windows shim boundary, and bounded detection diagnostics.
- `mcp/src/agent-providers/opencode-profile.ts` — Closed runtime inputs, private artifacts, isolation environment, exact fsb config and permission policy, cold/server/attach specifications, opaque bindings, and generic attestations.
- `tests/mcp-opencode-adapter.test.js` — Offline detection, profile-policy, binding, clean/poison attestation, fallback, malformed-input, and registry/matrix non-exposure coverage.
- `tests/agent-provider-forbidden-flags.test.js` — OpenCode isolation, forbidden flag, secret-placement, and declarations-only source gates.

## Decisions Made

- Retained the resolved executable path and revalidated the source-to-realpath identity around the version probe. A missing binary, unsupported shim, probe failure, identity change, malformed output, or any version other than 1.14.25 is unavailable rather than partially ready.
- Kept native authentication and native default-model selection deliberately outside the static profile. The detector does not inspect account, provider, project, home, or model data, and the config contains no credential or model override.
- Returned the closed private-artifact descriptions alongside the frozen spawn specification so the existing runtime materializer remains the sole filesystem authority while provider policy remains pure data.
- Used a SHA-256 digest of the shipped FSB prompt and exact ordered permission assertions to prove effective policy without embedding task content or granting an OpenCode-specific verification hook.
- Preserved the exact five-method generic adapter architecture. Profile declarations contain no process execution, network request, checker, callback, sixth method, raw reducer, adapter selector, or supervisor import.

## TDD Evidence

- **Detection RED:** the guarded detection section failed because `opencode-detect.ts` did not exist; the failing contract was committed as `29b73227`.
- **Detection GREEN:** the same guarded section passed after `e9e66dc4` implemented exact retained detection.
- **Profile RED:** the guarded profile-policy section failed because `opencode-profile.ts` did not exist; the failing contract was committed as `43d08afa`.
- **Profile GREEN:** the same guarded section passed after `2a56f261` declared the private profile and topology.
- **Attestation RED:** the guarded attestation/forbidden-source bundle failed at the missing generic declarations; the failing contract was committed as `c6e1c5b6`.
- **Attestation GREEN:** the same guarded bundle passed after `c974add2`, including clean fixtures, poison documents, missing-model/fallback failures, secret canaries, and forbidden-source gates.
- Plan 01 parser/fixture/drift, Plan 02 provider/supervisor, Plan 03 runtime/orphan-recovery, Claude adapter, reverse-channel, and bridge-topology regressions all passed through the workspace-preserving build wrapper.
- The complete guarded Phase 60/root regression suite exited 0 with both `[phase60-full-tests] PASS` and `[mcp-build-preserver] PASS` workspace-identity markers.

## Security and Privacy

- Detection is bounded to fixed native names and exact candidate identity. It never uses a shell, searches arbitrary shims, reads user configuration, inspects credentials, discovers processes, or exposes raw probe output in diagnostics.
- The OpenCode profile accepts only exact own-data context and runtime fields, normalized absolute paths, the exact retained profile pin, and bounded task text. Accessors, inherited records, sparse arrays, unknown keys, malformed UTF-16, traversal, and oversized values fail closed.
- Private configuration disables project and external instruction surfaces, exposes exactly one loopback FSB MCP, selects `fsb` as the primary non-subagent, denies general authority first, and allows only the resolved `fsb_*` prefix last.
- Task text is absent from argv, fixed environment, artifacts, descriptors, diagnostics, and attestation documents; it is representable only as the task child's stdin payload.
- Raw passwords, Basic headers, API keys, model selections, and owned endpoint credentials have no serializable field. Only the opaque supervisor-owned secret reference is declared, and only for the server/attach roles that require it.
- Generic descriptors are byte/time bounded and use closed codes and assertions. Missing agent/model/tool evidence, fallback warnings, poisoned plugin/MCP/command/instruction/skill/agent data, unknown permissions, malformed bodies, or oversized output produce a bounded not-ready result.
- Every applicable HIGH/CRITICAL threat is mechanically covered; none was accepted. Genuine account/model/process/network/browser behavior remains pending milestone-end human UAT and is not inferred from offline tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Final guarded repository-wide verification.
- **Issue:** The repository has known external Git stat-refresh interference on seven generated tracked entries during long guarded builds.
- **Fix:** After proving each entry content-identical to its index and clean in both worktree and staged diffs, temporarily marked exactly those entries assume-unchanged under EXIT/INT/TERM restoration traps. The pre-existing dirty `mcp/build/index.js` was explicitly excluded.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** The exact guarded suite exited 0; both workspace-preservation markers passed; all seven entries returned to ordinary `H`, remained byte-identical and clean, and unrelated dirty state was preserved.
- **Committed in:** n/a.

---

**Total deviations:** 1 auto-fixed blocking environmental condition.
**Impact on plan:** No implementation, test, generated file, wrapper, production registry, or compatibility matrix was changed outside the planned OpenCode detector/profile boundary.

## Issues Encountered

- The first long full-suite terminal session closed during context compaction after progressing through green tests, so its exit status could not be recovered. The exact guarded suite was rerun with an external temporary log and produced an auditable exit 0 plus both preservation PASS markers.

## User Setup Required

None - no dependency, service, credential, or local configuration was added.

## Verification

- Guarded detection section — PASS.
- Guarded profile-policy section — PASS.
- Guarded attestation plus provider forbidden-flags bundle — PASS.
- Guarded Plan 01-03, Claude adapter, provider contract, supervisor, orphan recovery, reverse-channel, and bridge-topology regressions — PASS.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","scripts/run-phase60-full-tests.mjs"]]'` — PASS with inner full suite and outer workspace preservation green.
- Scoped `git diff --check`, owned-path status, restored index-flag and byte-identity checks, declarative-profile source scan, forbidden-secret scan, and production non-exposure checks — PASS.

## Next Phase Readiness

- Plan 05 can compose the detector/profile with the parser and atomically expose OpenCode across the production registry, compatibility matrix, fixtures, and drift roster.
- Plans 07 and 08 can resolve the existing opaque server secret at spawn time and interpret the closed topology/attestation data through the generic supervisor without adding provider-specific branches.
- Live authenticated OpenCode delegation, native default-model resolution, owned-server behavior, browser feed parity, and assistive-technology behavior remain pending the milestone-end UAT sweep.
- No active blocker.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
