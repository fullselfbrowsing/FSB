---
phase: 65-codex-adapter
plan: "04"
subsystem: direct-runtime-authority
tags: [spawn-supervisor, environment-sanitizer, byte-probe, mcp-authority, scratch-cleanup]

requires:
  - phase: 65-codex-adapter
    plan: "03"
    provides: Consent-bound accepted identity and the immediate daemon detection barrier
provides:
  - Shared source-pinned agent environment sanitation with fixed-value restoration rejection
  - Bounded byte-only retained-process probes with failure-path and caller-path zeroization
  - Serve-owned opaque direct runtime references and exact provider-neutral authority classifiers
  - Supervisor-owned identity and effective-authority proof before runtime preparation, task spawn, or stdin
  - Role-aware empty direct scratch with tree, journal, and cleanup terminal authority
affects: [65-05, 65-08, codex-adapter, spawn-supervisor, orphan-recovery]

tech-stack:
  added: []
  patterns:
    - Brand privileged runtime and sanitized-environment values by object identity rather than structural shape
    - Reduce secret-bearing native output to frozen safe classifications before zeroing every owned byte buffer
    - Hold a successful result candidate until clean exit, process-tree settlement, journal mutation, and empty-scratch removal all succeed

key-files:
  created:
    - mcp/src/agent-providers/spawn-environment.ts
    - mcp/src/agent-providers/process-probe.ts
    - mcp/src/agent-providers/effective-authority.ts
    - tests/mcp-codex-adapter.test.js
  modified:
    - mcp/src/agent-providers/adapter.ts
    - mcp/src/agent-providers/runtime-files.ts
    - mcp/src/agent-providers/spawn-supervisor.ts
    - mcp/src/agent-providers/serve-delegation.ts
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-agent-orphan-recovery.test.js
    - tests/runtime-contracts.test.js

key-decisions:
  - "Keep the direct endpoint capability opaque and generation-bound so structural lookalikes, browser input, and cross-daemon references cannot reach buildSpawn."
  - "Apply the new empty direct runtime role only to descriptor-bound direct specs; existing Claude Code and OpenCode runtime paths retain their established artifact behavior."
  - "Run both proofs before creating the scratch or journal, sharing the task spawn's exact retained command and sanitized environment while using the already-owned supervisor cwd for the probes."
  - "Treat any non-empty direct scratch, unsettled process tree, or failed journal removal as terminal failure even after a valid result candidate and exit zero."

patterns-established:
  - "Generic authority barrier: paired frozen descriptors are classified by the supervisor without an adapter-id branch or additional adapter method."
  - "Empty-scratch authority: direct runtime cleanup accepts only an exact secure empty run directory and completes before result publication."

requirements-completed: [MULTI-04, MULTI-05]

duration: 46 min
completed: 2026-07-22
---

# Phase 65 Plan 04: Direct Runtime Authority Substrate Summary

**Direct task execution now has a provider-neutral, serve-owned authority chain: sanitized retained-binary probes must reprove identity and exact FSB MCP authority before an empty scratch, journal entry, task child, or stdin can exist, and success remains private until cleanup completes.**

## Performance

- **Duration:** 46 min
- **Started:** 2026-07-22T11:17:00Z
- **Completed:** 2026-07-22T12:03:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Centralized the complete existing Claude Code/OpenCode credential and discovery strip roster in an exact frozen sanitizer. Fixed environment values cannot restore stripped keys, while policy-owned forced values are applied last.
- Added a non-shell bounded process primitive with absolute command and cwd validation, argv-only invocation, abort/timeout/output caps, exact exit metadata, fresh Buffer ownership, closed error codes, and idempotent zeroization.
- Added opaque serve-minted direct runtime references pinned to the owned numeric-loopback `/mcp` endpoint and daemon generation, plus exact frozen identity and effective-authority descriptors/classifiers.
- Made the generic supervisor execute both proofs with the task spawn's exact sanitized environment and retained command before runtime preparation, task child creation, or stdin. Every mismatch, malformed response, signal, overflow, timeout, and uncertainty fails closed without a task process or journal entry.
- Added the `direct` runtime role: it creates only a mode-0700 empty per-run directory, writes no task/config/auth artifact, is removed on success/failure/cancellation/restart recovery, and rejects non-empty cleanup.
- Preserved the existing two-provider production roster and five-method adapter surface; no Codex adapter id, registry row, constructor, or fixture was exposed in this wave.

## Task Commits

Each task was committed atomically:

1. **Create the shared sanitizer and bounded byte-process primitive** — `4dd8c8aa` (feat)
2. **Add validated direct runtime references and generic effective-authority descriptors** — `21b2725d` (feat)
3. **Execute generic identity re-probe, authority attestation, and empty-scratch cleanup barriers** — `ee613adb` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/spawn-environment.ts` — Owns the exact inherited/stripped/forced environment policy, sanitizer, and sanitized-object brand.
- `mcp/src/agent-providers/process-probe.ts` — Runs bounded byte-only child probes and transfers zeroable Buffer ownership to classifiers.
- `mcp/src/agent-providers/effective-authority.ts` — Mints and validates direct runtime capabilities and classifies identity bytes and effective MCP authority into safe frozen results.
- `mcp/src/agent-providers/adapter.ts` — Adds exact private direct-runtime and paired pre-spawn descriptor contracts without changing adapter methods or the provider roster.
- `mcp/src/agent-providers/serve-delegation.ts` — Mints the direct runtime reference only after the FSB listener owns its endpoint and passes it to the supervisor.
- `mcp/src/agent-providers/runtime-files.ts` — Adds exact empty direct scratch preparation, activation, cleanup, and restart recovery.
- `mcp/src/agent-providers/spawn-supervisor.ts` — Uses the shared sanitizer, consumes generic bounded probes, gates runtime preparation/spawn/stdin, and makes direct cleanup part of terminal truth.
- `tests/mcp-codex-adapter.test.js` — Hosts generic probe and authority contract tests without constructing or importing a Codex production adapter.
- `tests/mcp-spawn-supervisor.test.js` — Proves shared environment identity, proof ordering, exact environment reuse, byte zeroization, zero-side-effect mismatch, and cleanup failure conversion.
- `tests/mcp-agent-orphan-recovery.test.js` — Proves empty direct scratch, non-empty cleanup rejection, and prepared/active restart cleanup.
- `tests/runtime-contracts.test.js` — Pins serve ownership, generic supervisor wiring, proof-before-runtime ordering, direct cleanup, and absence of a provider-id branch.

## Decisions Made

- Reused the established `PolicyAttestationFailure` safe diagnostic boundary so native probe errors and response bytes never reach terminal records, events, logs, or exception text.
- Kept probe execution before direct runtime preparation. The supervisor cwd already exists and is daemon-owned; the task cwd is the per-run scratch created only after both proofs succeed.
- Reused one sanitized environment object for both probes and the eventual task spawn. The task argv signature is a policy-forced value, so adapter fixed values cannot replace it.
- Retained legacy direct runtime preparation for descriptor-free Claude Code paths. Only a validated paired identity/authority description selects the new empty direct role.
- Kept recovery dispositions delegation-specific. Recovered direct scratch is infrastructure state, so it is removed without manufacturing a browser-visible lost-run record.

## Verification

- Task 01 preservation wrapper: generic byte-probe and shared-environment sections — **PASS**.
- Task 02 preservation wrapper: runtime contracts and generic-authority section — **PASS**.
- Task 02 supplemental bridge topology — **PASS**, 312/312 assertions.
- Task 02 supplemental native-host bind-race coverage — **PASS**, 22/22 assertions.
- Task 03 prescribed preservation wrapper: pre-spawn-authority section, complete orphan-recovery suite, and runtime contracts — **PASS**, including 28 runtime-contract assertions.
- Preservation-wrapped complete supervisor regression suite — **PASS**.
- Preservation-wrapped shared-environment, generic-probe, and generic-authority regression sections — **PASS**.
- Source and compiled native-host boundary checks, TypeScript compilation, and scoped `git diff --check` — **PASS**.
- The inherited 402 planning deletions, dirty `mcp/build/index.js`, and three showcase artifacts stayed unstaged and unchanged; the inherited build-index SHA-256 remained `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`.

## Deviations from Plan

None - all three tasks stayed within the declared production/test paths, retained the two-provider production boundary, and were committed separately.

## Issues Encountered

- The first supplemental complete-supervisor run exposed a legacy cancellation assertion that expected build-stage runtime cleanup ownership. The supervisor now retains that ownership for existing specs and relinquishes it only after validating a descriptor-bound direct spec, preserving old cancellation behavior while keeping pre-spawn authority mismatches journal-free.
- The first direct endpoint supplemental check used a root-path assumption; the already-owned production endpoint is exactly `/mcp`. The validator and tests were aligned to that canonical endpoint before Task 02 was committed.

## User Setup Required

None - no dependency, credential, external service, or configuration was added.

## Next Phase Readiness

- Plan 65-05 can add the Codex adapter atomically by producing the paired generic descriptors, deriving its cwd from the provided per-run path, and relying on the supervisor for endpoint materialization, probes, child creation, stdin, and cleanup.
- The shared strip roster is ready for Plan 65-05 to add the exact reviewed Codex credential and exec-server keys plus its single policy-forced value.
- Existing Claude Code and OpenCode paths and the complete supervisor regression remain green; no Plan 04 blocker remains.

## Self-Check: PASSED

- All three task commits exist and contain only their declared paths.
- Focused acceptance commands and broader supervisor/recovery regressions pass through the workspace-preserving build wrapper.
- Probe bytes are zeroed, mismatches create no task process/journal/stdin, and result publication follows tree/journal/empty-scratch cleanup.
- No Codex production symbol, adapter registration, compatibility row, or fixture was introduced.
- The 402 inherited deletions and four unrelated dirty artifacts remain untouched and unstaged with the original build-index hash.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
