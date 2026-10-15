---
phase: 64-opencode-adapter
plan: "07"
subsystem: agent-provider-owned-server-lifecycle
tags: [opencode, supervisor, owned-server, basic-auth, replay-fence, process-lifecycle]

requires:
  - phase: 64-opencode-adapter
    plan: "02"
    provides: Closed provider-neutral direct/owned-server topology and opaque spawn-secret binding contract
  - phase: 64-opencode-adapter
    plan: "03"
    provides: Role-aware delegation/provider_server runtime journal, process identity, cleanup, and recovery
  - phase: 64-opencode-adapter
    plan: "04"
    provides: Declarative OpenCode cold/server/attach process specifications and exact readiness policy
  - phase: 64-opencode-adapter
    plan: "05"
    provides: Exact Claude Code/OpenCode production registry and provider-neutral five-method adapter composition
provides:
  - Generic topology-driven cold-first task selection with a permanent pre-spawn replay fence
  - One generation-owned loopback/port-0 server lease verified by readiness, process identity, version, config digest, and authenticated health
  - Supervisor-only random Basic secret bytes with transient server/attach env and health-header materialization
  - Reference-counted fresh attach children with token-fenced idle teardown and exact-once health/exit/close cleanup
affects: [64-08, 64-09, 64-10, 64-12, 64-13]

tech-stack:
  added: []
  patterns:
    - Branch on immutable topology and process role rather than provider identity
    - Treat attach as a verified optimization over deterministic cold execution
    - Resolve opaque secret bindings only inside direct spawn and HTTP call seams, then scrub ephemeral objects
    - Release server leases only after the selected task tree and runtime state settle

key-files:
  created:
    - tests/mcp-opencode-server-topology.test.js
  modified:
    - mcp/src/agent-providers/spawn-supervisor.ts

key-decisions:
  - "Keep the first owned-topology task cold while warming one server in parallel; only a later request may acquire a re-verified lease and select attach."
  - "Retain only random secret bytes behind owned_server_basic_password; derive raw password and Basic Authorization strings only around the exact spawn or HTTP call and scrub the mutable call objects immediately afterward."
  - "Reference-count each selected attach before task spawn, release only in executeRun finally after task cleanup, and fence idle callbacks with monotonic lease tokens."
  - "Retire an identity-, topology-, generation-, or health-invalid lease before any new attach and coalesce all idle, exit, health-loss, and daemon-close paths through one exact-once stop promise."

patterns-established:
  - "Cold-first replay safety: selection can fall back before a task child exists; the selected task-child spawn permanently closes replay."
  - "Owned lease proof: topology/config/generation, retained process identity, exact loopback readiness, and authenticated health all remain mandatory for attach."
  - "Lease settlement order: task child tree and role-aware runtime cleanup complete before activeCount decrements and idle teardown may arm."

requirements-completed: [MULTI-01, MULTI-02]

duration: 48 min
completed: 2026-07-20
---

# Phase 64 Plan 07: Generic Owned-Server Selection and Lifecycle Summary

**The provider-neutral supervisor now executes owned-server topology cold first, attaches only to an FSB-owned authenticated lease, delivers every task to one fresh child, and reclaims the server through bounded reference-counted exact-once lifecycle control.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-07-20T22:47:27Z
- **Completed:** 2026-07-20T23:34:59Z
- **Tasks:** 3 TDD tasks
- **Files modified:** 2 implementation/test paths

## Accomplishments

- Added a deterministic injected process/HTTP/clock harness that proves direct-versus-owned selection is driven by topology even when adapter identities are deliberately inverted, and that no post-spawn failure replays task text through a cold child.
- Added one generation-owned loopback server warm path with provider_server journal-before-spawn ordering, bounded exact readiness, retained process identity, exact authenticated `/global/health` validation, and cold-only fallback whenever ownership cannot be proven.
- Minted at least 32 CSPRNG bytes into a supervisor-only volatile store and propagated the exact derived password only to the owned-server and selected attach spawn calls; cold/direct children, fixed environment, journal, topology, diagnostics, and retained snapshots receive none.
- Balanced concurrent attach acquisitions with cleanup-before-release reference counting, stale idle-token cancellation, health/exit retirement, coalesced warm/stop promises, and task-before-server daemon shutdown ordering.
- Preserved the existing direct Claude Code supervisor, provider_server recovery distinction, process-tree safety, reverse channel, bridge topology, inventory/doctor/storage, historical contracts, and complete repository baseline.

## Task Commits

All three planned TDD tasks landed as explicit RED/GREEN pairs:

1. **Selection and replay-fence RED** — `360ffc12` (test; topology poison-id, cold/attach selection, and post-spawn no-replay cases)
2. **Selection and replay-fence GREEN** — `cb1c4238` (feat; generic direct/owned topology interpretation and replay fence)
3. **Owned health and secret-binding RED** — `6b3e2650` (test; random secret, transient env/header, readiness, health, and identity matrix)
4. **Owned health and secret-binding GREEN** — `ee237fac` (feat; journaled server warm, volatile secret store, exact readiness/health proof, and scrubbed call seams)
5. **Bounded lease lifecycle RED** — `58c99118` (test; concurrent warming, lease counts, fake idle clock, health loss, and overlapping close)
6. **Bounded lease lifecycle GREEN** — `e71945d2` (feat; acquisition/release accounting, tokened idle teardown, retirement, and exact-once stop)

## Files Created/Modified

- `tests/mcp-opencode-server-topology.test.js` — Offline topology, replay, secret propagation/scrubbing, readiness/health, concurrency, session freshness, idle, health-loss, and close-race integration harness.
- `mcp/src/agent-providers/spawn-supervisor.ts` — Generic owned-server topology interpreter, volatile Basic-secret resolution, authenticated lease proof, reference counting, idle fencing, retirement, and exact-once server teardown.

`mcp/src/agent-providers/runtime-files.ts`, `tests/mcp-agent-orphan-recovery.test.js`, and `tests/mcp-spawn-supervisor.test.js` required no Plan 07 edits: Plan 03 already supplied the role-aware provider_server recovery/removal contract, and the existing regression suites proved those boundaries remained green.

## Decisions Made

- Kept task selection deterministic: a request with no verified lease commits to its declared cold process while one shared server warm is allowed to complete; successful warming never converts that already-selected task into attach.
- Re-verified exact process identity and authenticated health immediately before acquisition. A topology, generation, secret, identity, or health mismatch retires the lease before it can authorize another attach.
- Counted only selected attach tasks as active server leases. Cold/direct tasks do not hold the server, while each attach increments before task-child spawn and decrements exactly once after its task tree/runtime cleanup.
- Made retiring leases non-attachable. If a lease loses health while active tasks remain, existing tasks may settle, new tasks stay cold, and the server stops when the final active reference releases.
- Used one coalesced stop promise for idle, unexpected exit, health loss, and close. Teardown clears attach authority and the volatile secret before any later warm can create a replacement.
- Left role-aware startup recovery unchanged because its existing provider_server classification already kills only confirmed stale owned trees, emits no lost-delegation disposition for them, and fails closed without signaling ambiguous processes.

## Security and Verification

- Exact Task 1, Task 2, and Task 3 workspace-preserving commands — PASS at their RED/GREEN boundaries.
- Complete topology harness plus provider-contract regression — PASS after the final lifecycle implementation.
- Accumulated Plans 01–07 parser, fixture, drift, detector, profile policy, attestation, composition, compatibility, inventory, doctor, storage, supervisor, orphan recovery, Claude adapter, reverse-channel, bridge-topology, historical contract, and version-parity matrix — PASS.
- `verify-agent-provider-flags`, source and compiled native-host boundary checks, TypeScript build, scoped `git diff --check`, exact commit path rosters, no-provider-branch scan, no-discovery/port-scan/`--password` scan, 32-byte secret-mint pin, and single replay-fence pin — PASS.
- Exact guarded repository baseline emitted `[phase60-full-tests] PASS` and `[mcp-build-preserver] PASS`; the enclosing restoration/hash audit exited 0.
- All six temporary generated-entry flags returned to ordinary `H`, each worktree object remained index-identical, staging remained empty, branch remained `automation`, and the dirty-worktree count remained exactly 406.
- Protected unrelated hashes remained exact: `mcp/build/index.js` `6a492a2e...`, `llms-full.txt` `664347e0...`, `llms.txt` `c69ed23d...`, and `sitemap.xml` `826aa8f8...`.
- Every applicable HIGH/CRITICAL threat is mechanically mitigated; none was accepted. Genuine local OpenCode process/network/browser behavior remains milestone-end human evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reused the documented reversible index-stat mitigation for the final full suite**

- **Found during:** Final guarded repository-wide verification.
- **Issue:** Long guarded builds are known to trigger an external lock-enabled Git stat refresher on the six content-clean tracked generated entries whose mtimes the build changes, violating the frozen outer wrapper's raw-index byte invariant even when content and tests are green.
- **Fix:** Proved the exact six entries ordinary tracked, worktree/staged clean, and object-identical to the index; temporarily marked only those entries assume-unchanged under EXIT/INT/TERM restoration traps. The pre-existing dirty `mcp/build/index.js` and three dirty showcase artifacts were excluded and hash-protected.
- **Files modified:** None; temporary local index flags only, all restored.
- **Verification:** The exact guarded suite and outer wrapper passed, the enclosing postcheck exited 0, all six flags returned to ordinary `H`, object identity remained exact, protected hashes matched, and dirty/staged state was preserved.
- **Committed in:** n/a.

---

**Total deviations:** 1 auto-fixed blocking environmental condition.
**Impact on plan:** No implementation, test, generated file, wrapper, runtime journal, provider registry, or UI scope was added or altered outside the planned supervisor/topology harness boundary.

## Issues Encountered

- The first accumulated regression invocation ran `mcp-opencode-adapter.test.js` without its mandatory `--section` argument and stopped at that harness's command-shape assertion. No product or test source changed; the matrix was rerun with all five exact named sections and passed completely.
- The Task 3 RED harness initially released held task children before both pending completion callbacks were installed. The test setup was tightened before the RED commit so the committed failure was the intended missing zero-count idle teardown behavior rather than a fixture race.

## User Setup Required

None - no dependency, credential, service, live provider, browser, or local configuration was added.

## Next Phase Readiness

- Plan 08 can execute the already-declared cold/server policy attestations through the shared verifier, add bounded fallback-stderr enforcement, and strengthen result publication ordering on top of the verified lease and replay fence.
- Plans 09–13 can treat OpenCode cold/attach as the same provider-neutral delegation lifecycle; endpoint, topology, secret, and local process evidence remain unavailable to browser state.
- Genuine authenticated OpenCode cold/attach parity and kill-switch reclamation remain intentionally pending milestone-end human UAT.
- No active blocker.

## Self-Check: PASSED

- All six TDD commits contain exactly their declared production or test path.
- The two planned implementation/test files exist and are clean after their task commits.
- All exact task gates, accumulated affected regressions, source/security checks, full guarded suite, restoration checks, and protected-byte checks pass.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
