---
phase: 64-opencode-adapter
plan: "08"
subsystem: agent-provider-supervisor-authority
tags: [opencode, supervisor, attestation, replay-fence, stderr-policy, result-barrier]

requires:
  - phase: 64-opencode-adapter
    plan: "02"
    provides: Closed provider-neutral topology, attestation descriptor, and opaque secret-binding contracts
  - phase: 64-opencode-adapter
    plan: "04"
    provides: Exact OpenCode process/server policy descriptors and pinned fallback-warning evidence
  - phase: 64-opencode-adapter
    plan: "07"
    provides: Cold-first owned-server selection, authenticated lease ownership, replay fence, and exact tree cleanup
provides:
  - Generic bounded process/server effective-policy attestation before task or attach authority
  - Exact-once selected-child task delivery with permanent post-spawn no-replay and bounded fallback-stderr rejection
  - Private result-candidate retention through parser, stderr, exit, tree, and runtime-cleanup corroboration
  - Provider-neutral started/event/final ordering with no topology, secret, raw policy, or stderr projection
affects: [64-09, 64-10, 64-11, 64-12, 64-13, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Interpret policy descriptors by closed source kind and delegate every document verdict to the shared verifier
    - Permanently close replay before selected task-child spawn and centralize one guarded task write plus EOF
    - Treat parser result as a private candidate until clean process and cleanup truth make it publishable

key-files:
  created: []
  modified:
    - mcp/src/agent-providers/spawn-supervisor.ts
    - tests/agent-provider-forbidden-flags.test.js
    - tests/mcp-opencode-server-topology.test.js
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-reverse-channel-contract.test.js
    - tests/mcp-bridge-topology.test.js

key-decisions:
  - "Run cold process attestations under the exact selected environment and owned-server attestations through transient authenticated loopback GETs, retaining only the shared verifier's frozen verdict."
  - "Set the replay fence before the selected child spawn and allow only one role-checked stdin writer, so every later spawn, stream, stderr, exit, or cancellation failure can only clean up and settle."
  - "Store exactly one normalized result candidate privately and publish it only after parser EOF, clean stderr, code 0/no signal, verified task-tree settlement, and runtime removal."
  - "Keep provider-error results non-successful and keep topology, endpoint, password, Authorization, task reflection, raw policy documents, and stderr outside reverse-channel frames and durable state."

patterns-established:
  - "Attestation-before-authority: effective policy must pass before any task acceptance, and a server lease is not attachable until authenticated policy verification succeeds."
  - "No-replay task boundary: selected task-child spawn is the irreversible boundary; all post-boundary failures converge on cleanup rather than fallback."
  - "Corroborated result commit: normalized provider success is only a candidate until independent process/tree/runtime evidence confirms it."

requirements-completed: [MULTI-01, MULTI-02, MULTI-03]

duration: 49 min
completed: 2026-07-20
---

# Phase 64 Plan 08: Policy, Replay, and Result Authority Summary

**Cold and attached OpenCode execution now proves effective policy before task authority, delivers task bytes once with no post-spawn fallback, and publishes success only after clean exit plus verified tree/runtime cleanup.**

## Performance

- **Duration:** 49 min
- **Started:** 2026-07-20T23:43:18Z
- **Completed:** 2026-07-21T00:32:18Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 6 implementation/test paths

## Accomplishments

- Executed the four closed OpenCode attestations through one provider-neutral supervisor interpreter: shell-free bounded `process_json` probes before cold selection and transient Basic-authenticated `owned_server_json` probes after server health/identity proof but before lease publication.
- Rejected malformed, accessor/prototype-bearing, oversized, timed-out, contaminated, wrong-prompt, subagent, permission-order, model-override, and no-model evidence without a started event, task child, task stdin, or attachable lease; raw documents, provider values, stderr, credentials, and headers remain transient and unprojected.
- Centralized a replay-guarded role-checked task writer so direct, cold, and attach children receive the exact task once followed by EOF, while preflight/server stdin receive no task and any post-spawn failure is terminal rather than a cold retry.
- Added bounded streaming detection for the pinned OpenCode missing/invalid-fsb fallback warnings, including split chunks, and mapped them to closed protocol drift without forwarding raw stderr.
- Retained exactly one result candidate privately through parser EOF, stderr drain, child close, clean code/no signal, task-tree settlement, and runtime removal; all provider-error, parser, exit, signal, stderr, cancellation, timeout, tree, and cleanup failures publish zero result events.
- Preserved the existing provider-neutral reverse channel and bridge shape: one exact `delegation.started`, normalized nonterminal chronology, one result only after the cleanup barrier, then one final settlement.

## Task Commits

All three planned TDD tasks landed as explicit RED/GREEN pairs:

1. **Policy-attestation RED** — `1c5a0999` (test; clean and poisoned process/server policy matrix plus source authority gates)
2. **Policy-attestation GREEN** — `973de772` (feat; generic bounded process/server probes and shared-verifier enforcement)
3. **Task-once/replay RED** — `26bb1571` (test; direct/cold/attach call order, stdin, fallback stderr, secret, zero-event, and wire cases)
4. **Task-once/replay GREEN** — `0a7b2112` (feat; permanent replay boundary, central task writer, and streaming fallback detector)
5. **Terminal-barrier RED** — `481b52a9` (test; visibility checkpoints and adverse parser/exit/tree/runtime/cancel matrix)
6. **Terminal-barrier GREEN** — `c29c91e1` (feat; private candidate and post-cleanup result publication)

## Files Created/Modified

- `mcp/src/agent-providers/spawn-supervisor.ts` — Generic policy probe interpreter, transient authenticated server attestation, task-once writer, fallback-stderr detector, and authoritative result commit barrier.
- `tests/mcp-opencode-server-topology.test.js` — Deterministic cold/server policy, task-once, secret-scrubbing, fallback, and terminal visibility matrices.
- `tests/mcp-spawn-supervisor.test.js` — Direct lifecycle and adverse terminal-result regression coverage.
- `tests/mcp-reverse-channel-contract.test.js` — Exact two-provider started/event/result/final payload and negative projection checks.
- `tests/mcp-bridge-topology.test.js` — Result-before-final ordering only after the supervisor cleanup barrier.
- `tests/agent-provider-forbidden-flags.test.js` — Provider-neutral attestation authority and forbidden secret/header/provider-branch source gates.

`mcp/src/agent-providers/serve-delegation.ts` required no Plan 08 edit: its existing provider-neutral registry lookup and transport already satisfied the strengthened lifecycle, and the exact reverse-channel/bridge regressions passed unchanged.

## Decisions Made

- Used only descriptor source (`process_json` or `owned_server_json`) to select the probe mechanism. The supervisor imports no OpenCode profile/checker and adds no provider-id branch, callback, or sixth adapter method.
- Ran process probes with the selected fixed environment, shell disabled, no secret binding, bounded streams/deadline, empty stdin/EOF, and exact tree cleanup. Server probes accept only loopback endpoints, exact GET descriptors, bounded JSON content, and the supervisor-owned Basic reference.
- Emitted `delegation.started` only after selected-child activation and before the single task write. Its payload remains exactly `delegationId`, `adapterId`, and `profileVersion`.
- Treated every recognized fallback warning as protocol drift. Unknown future warning forms remain protected by the exact OpenCode 1.14.25 spawn-eligibility pin.
- Removed the result from the stream-publishing path entirely. `consumeEvents` records one frozen candidate; `executeRun` alone may publish it after all corroborating gates.

## Security and Verification

- Exact Task 1 command (`policy-attestation` topology section plus forbidden-flags gate) — PASS at RED/GREEN completion.
- Exact Task 2 command (`task-once` topology section, complete supervisor, and reverse channel) — PASS at RED/GREEN completion.
- Exact Task 3 command (complete supervisor, `terminal-barrier` topology section, reverse channel, and bridge topology) — PASS at RED/GREEN completion; bridge topology reported `312 passed, 0 failed`.
- Accumulated Plans 01–08 matrix — PASS across all five OpenCode adapter sections, fixture/drift/provider contracts, Claude regression, complete topology/supervisor/orphan recovery, compatibility/diagnostics/inventory/storage, reverse channel, bridge topology, version parity, forbidden flags, and source/compiled native boundaries.
- `verify-agent-provider-flags`, source and compiled `verify-native-host-boundary`, TypeScript MCP build, `git diff --check`, six-commit scope/whitespace checks, exact RED-test/GREEN-source inventories, and added-source no-provider-branch/no-forbidden-flag/no-shell/no-listener scan — PASS.
- Guarded repository suite emitted `[phase60-full-tests] PASS: full suite passed and workspace state was preserved` and `[mcp-build-preserver] PASS: MCP build and commands completed with workspace identity preserved`.
- The final preservation postcheck reported `suite=0 postcheck=0 branch=automation dirty=406 staged=0`; all six temporary generated-entry flags returned to ordinary `H` and remained object-identical.
- Protected unrelated hashes remained exact: `mcp/build/index.js` `6a492a2e...`, `llms-full.txt` `664347e0...`, `llms.txt` `c69ed23d...`, and `sitemap.xml` `826aa8f8...`.
- T64-02, T64-04, T64-05, T64-06, T64-07, T64-08, and T64-09 are mechanically mitigated with no accepted HIGH/CRITICAL finding. Genuine installed OpenCode, account/model, loopback scheduling, OS tree timing, and browser behavior remain milestone-end human evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Final guarded repository-wide verification.
- **Issue:** The complete inner root suite passed and restored its workspace, but the frozen outer wrapper observed the known raw-index stat-field refresh on generated build entries and exited 1. A second unshielded run with optional Git locks disabled reproduced the same environmental-only outer postcondition while every product test remained green and outer cleanup restored the baseline.
- **Fix:** Proved exactly six documented generated entries regular, ordinary tracked, clean in worktree and staged diffs, and object-identical to the index. Temporarily marked only those six entries assume-unchanged under EXIT/INT/TERM restoration traps, explicitly excluding dirty `mcp/build/index.js` and the three dirty showcase artifacts, then reran the exact guarded command and restored every flag.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** Both inner and outer PASS markers emitted; `suite=0 postcheck=0`; six entries returned to ordinary `H`; protected hashes, branch, compatibility-path absence, staging, and exact 402-deleted/4-modified inventory remained unchanged.
- **Committed in:** n/a.

---

**Total deviations:** 1 auto-fixed blocking environmental condition.
**Impact on plan:** No wrapper, harness, implementation, generated artifact, transport, or provider scope changed; the first inner-green/outer-false-positive evidence remains recorded rather than erased.

## Issues Encountered

- No stale historical regression required a source or test update. All accumulated Phase 60–64 contracts accepted the strengthened supervisor behavior unchanged.
- The first two full-suite invocations completed every inner test green but exposed the known external raw-index stat refresh only at the frozen outer byte check. The scoped documented mitigation produced a current full green receipt without changing product or test sources.

## User Setup Required

None - no dependency, credential, service, live provider, browser, or local configuration was added.

## Next Phase Readiness

- Plan 09 can route OpenCode through canonical extension preflight, consent, trust, and background authority while treating the supervisor's task-once and result barrier as fixed provider-neutral behavior.
- Plans 10–13 can persist and render normalized events without topology, endpoint, secret, policy, stderr, or premature-success exposure.
- Genuine authenticated OpenCode cold/attach parity and OS/browser reclamation remain intentionally pending the milestone-end human UAT ledger.
- No active blocker.

## Self-Check: PASSED

- All six TDD commits contain only their declared test or production scope; the final implementation inventory is exactly one production path plus five test paths.
- All exact task gates, accumulated affected regressions, source/security audits, guarded repository suite, restoration checks, and protected-byte checks pass.
- No HIGH/CRITICAL finding remains open or accepted, staging is empty, branch is `automation`, and the pre-existing 406-entry dirty baseline is intact.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
