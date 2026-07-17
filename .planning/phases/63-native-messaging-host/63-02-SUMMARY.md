---
phase: 63-native-messaging-host
plan: "02"
subsystem: native-host-daemon-lifecycle
tags: [native-messaging, health, readiness, bridge-auth, bind-race, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Release-bound host constants, stable runtime contract, and workspace-preserving MCP build guard from Plan 01
  - phase: 59-reverse-request-channel-security-foundation
    provides: Exact loopback, Origin, Host, session-secret, pairing, and agent-spawn channel boundaries
provides:
  - Product-specific bounded health identity with a false-by-default serve readiness latch
  - Post-bind, post-recovery bridge-auth preparation before authenticated bridge connection
  - Deterministic same-port lifecycle race proving bind losers are inert
affects: [63-03, 63-04, native-host-health, serve-lifecycle, bridge-auth]

tech-stack:
  added: []
  patterns:
    - Closure-owned readiness becomes true only after bind, recovery, auth preparation, bridge connect, and inventory publication
    - Bridge auth is an injected lifecycle hook owned only by the successful listener

key-files:
  created:
    - tests/mcp-native-host-daemon.test.js
  modified:
    - mcp/src/http.ts
    - mcp/src/agent-providers/serve-delegation.ts
    - mcp/src/index.ts
    - tests/mcp-bridge-topology.test.js

key-decisions:
  - "Health compatibility is identified by exact service `fsb-mcp-server`, numeric `nativeHostProtocol: 1`, and false-by-default `serveReady`; the bounded canonical package version remains diagnostic evidence."
  - "Only `startServeDelegation` receives readiness authority, and it invokes that authority after initial inventory publication."
  - "`runHttpMode` supplies secret rotation as `prepareBridgeAuth`; the lifecycle invokes it once only after successful bind and recovery."

patterns-established:
  - "Serve barrier: bind -> recover -> prepareBridgeAuth -> connect -> pushInventory -> markServeReady."
  - "Bind-loser inertness: no supervisor, recovery, auth preparation, bridge connect, inventory push, or readiness publication before listener ownership."

requirements-completed: [NATIVE-03]

duration: 18 min
completed: 2026-07-17
---

# Phase 63 Plan 02: Product-Specific Serve Readiness and Bind Ownership Summary

**The serve daemon now identifies itself with an exact bounded health contract and rotates bridge auth only after it owns the loopback listener, leaving every bind loser inert.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-17T04:03:00Z
- **Completed:** 2026-07-17T04:21:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Extended `/health` additively with exact `service`, canonical bounded `version`, numeric `nativeHostProtocol`, and closure-owned `serveReady` while preserving every prior topology, queue, session, port, and transport field.
- Added an idempotent readiness authority that starts false, becomes true only after the complete serve startup barrier, and returns false during HTTP cleanup.
- Moved daemon-session secret rotation out of the pre-bind router path and into an injected post-bind/post-recovery lifecycle hook before bridge connection.
- Added a real same-port concurrent lifecycle regression that proves exactly one listener wins and the loser cannot create a supervisor, recover, rotate auth, connect, push inventory, or advertise readiness.
- Preserved the Phase 59 channel and pairing contract through the full topology regression suite.

## Task Commits

Each task followed a committed RED/GREEN TDD sequence:

1. **Task 63-02-01 RED: Product health and readiness contract** — `94289fec` (test)
2. **Task 63-02-01 GREEN: Product-specific serve readiness** — `5d0a0fb4` (feat)
3. **Task 63-02-02 RED: Bind-owner concurrency regression** — `f775dd5e` (test)
4. **Task 63-02-02 GREEN: Post-bind bridge-auth ownership** — `23070e9d` (fix)

## Files Created/Modified

- `mcp/src/http.ts` — Adds exact product/protocol/version identity and the closed false-by-default readiness latch.
- `mcp/src/agent-providers/serve-delegation.ts` — Adds the post-recovery auth hook and final post-inventory readiness transition.
- `mcp/src/index.ts` — Supplies secret rotation only through the serve lifecycle hook instead of rotating before bind.
- `tests/mcp-native-host-daemon.test.js` — Exercises bounded health identity and a real two-attempt same-port ownership race.
- `tests/mcp-bridge-topology.test.js` — Pins exact startup order, failure non-readiness, auth preparation counts, and unchanged channel behavior.

## Decisions Made

- Used the already frozen numeric native-host protocol version as the health compatibility boundary; package version remains bounded canonical evidence rather than the compatibility decision.
- Kept readiness state inside the HTTP listener closure. No caller-supplied startup option can claim readiness, and the only production call site is the serve lifecycle after inventory publication.
- Kept secret rotation in the CLI composition root but delegated its execution time to the lifecycle. This preserves Phase 59 ownership while making listener ownership the prerequisite.
- Allowed a bind loser to disconnect only the unconnected bridge object it constructed; it owns no listener or supervisor and performs no downstream authority-bearing operation.

## TDD Evidence

- **Task 1 RED:** the guarded health command failed because `service`, `version`, `nativeHostProtocol`, `serveReady`, and `markServeReady` were absent.
- **Task 1 GREEN:** the same guarded command passed 18/18 health assertions and the complete topology suite with readiness last in the barrier.
- **Task 2 RED:** the real same-port race produced one winner and one loser but failed because the winner never invoked the injected auth hook.
- **Task 2 GREEN:** the winner invoked auth preparation exactly once between recovery and connect; the loser retained zero auth/bridge/inventory/readiness effects.

## Security and Privacy

- T63-03 is mitigated by exact service identity, numeric protocol identity, bounded canonical version, HTTP 200/body-cap assertions, and a false-by-default readiness latch.
- T63-04 is mitigated by post-bind/post-recovery auth preparation and deterministic zero-side-effect bind-loser assertions.
- T63-12 remains closed: readiness reports only daemon reachability and does not enter pairing, provider, task, delegation, or browser-state schemas.
- No health field contains a secret, pairing state, task content, environment value, path, or raw error.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Both expected RED gates failed for the intended missing behavior and both GREEN gates passed through the workspace-preserving build wrapper.
- The GSD progress updater counted collapsed archive sections despite `STATE.md`'s milestone-scoped invariant. The authoritative v0.9.91 totals were restored manually while preserving the successful Plan 03 advance, metric, decisions, and session record.

## Known Pending Evidence

- Genuine simultaneous native-process scheduling with a live paired Chrome connection remains `human_needed` for the milestone-end UAT sweep.
- No browser, installed native host, live daemon, platform CLI, or human UAT was run or marked passed.

## User Setup Required

None during autonomous implementation.

## Verification

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-daemon.test.js","--section","health"],["node","tests/mcp-bridge-topology.test.js"]]'` — PASS after Task 1.
- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-native-host-daemon.test.js","--section","bind-race"],["node","tests/mcp-bridge-topology.test.js"]]'` — PASS after Task 2.
- Combined guarded plan gate with the complete daemon harness and topology suite — PASS: daemon 40/0, topology 310/0.
- `git diff --check` — clean for every Plan 02 source/test change.
- Protected SHA-256 values remain exact: `mcp/build/index.js` `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`; showcase `664347e0...`, `c69ed23...`, `826aa8f8...`; Phase 62 UAT `b6895278...`; agent history `93904eeb...`.

## Next Phase Readiness

- Plan 63-03 can build the closed one-shot native protocol against exact product/readiness facts without risking secret rotation from a losing serve process.
- Plan 63-04 can treat only exact ready FSB health as reachability and safely coalesce wake attempts around listener ownership.
- No autonomous implementation blocker remains; genuine scheduler/browser behavior stays in the deferred milestone-end evidence ledger.

## Self-Check: PASSED

- All five Plan 02 implementation/test artifacts exist.
- Commits `94289fec`, `5d0a0fb4`, `f775dd5e`, and `23070e9d` exist in order.
- Both task commands and the combined plan gate pass through the Plan 01 workspace-preserving build wrapper.
- Protected generated, showcase, Phase 62 UAT, and agent-history hashes remain unchanged.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-17*
