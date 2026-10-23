---
phase: 61-delegation-ux-sw-eviction-persistence
plan: "03"
subsystem: delegation-bridge-lifecycle
tags: [delegation, websocket, heartbeat, mv3, chrome-116]

requires:
  - phase: 59
    provides: authenticated reverse-request correlation and closed bridge frames
  - phase: 60
    provides: daemon-owned delegation transport and exact-once settlement
  - phase: 61-02
    provides: write-before-fanout ledger and sole delegated lifecycle controller
provides:
  - per-correlation ordered async observer barriers that settle before matching final responses
  - one ref-counted 20-second active-delegation heartbeat with exact nonce acknowledgement
  - Chrome 116 minimum with unchanged MV3 permissions and no native or restart authority
affects: [61-04, 61-06, 61-07, phase-62, phase-63]

tech-stack:
  added: []
  patterns:
    - per-pending promise tails isolate event ordering and observer failure by correlation
    - one Set-backed heartbeat roster replaces ordinary keepalive only while active
    - exact closed heartbeat parsing preserves legacy nonce-absent pings additively

key-files:
  created: []
  modified:
    - extension/ws/mcp-bridge-client.js
    - extension/manifest.json
    - mcp/src/bridge.ts
    - tests/mcp-bridge-client-lifecycle.test.js
    - tests/agent-grace.test.js
    - tests/mcp-version-parity.test.js
    - tests/mcp-reverse-channel-contract.test.js

key-decisions:
  - "Snapshot the global observer roster per event, serialize it on that pending correlation only, and let any observer failure win over the matching nominal final response."
  - "Replace the ordinary 25-second ping with one shared 20-second exact-nonce loop only while the delegation-owner Set is nonempty; three misses classify connectivity without inferring restart or replay."
  - "Accept only exact legacy or nonce heartbeat frames with safe timestamps and bounded opaque nonces; the daemon echoes but never stores or interprets the nonce."
  - "Pin Chrome 116 without changing the established permission roster, bridge load order, or extension authority."

patterns-established:
  - "Every pending reverse request owns eventTail and observerError; matching final settlement snapshots and awaits only that request's tail."
  - "Heartbeat owner retain/release is idempotent, staggered owners share one interval, and close/reconnect clears then recreates at most one loop without replay."

requirements-completed:
  - LIFE-01
  - LIFE-02
  - LIFE-03

duration: 18min
completed: 2026-07-14
---

# Phase 61 Plan 03: Ordered Bridge Events and Acknowledged Delegation Heartbeat Summary

**The extension bridge now gives each reverse request its own ordered async commit barrier, classifies active delegation connectivity through one exact-nonce 20-second heartbeat, and stays inside an unchanged Chrome 116 MV3/no-native authority boundary.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-14T22:50:00Z
- **Completed:** 2026-07-14T23:08:15Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added a global async event-observer roster whose invocation is serialized on each pending request's private promise tail, preserving registration order and the legacy per-request callback after global observers.
- Made a matching final response wait for all earlier matching events, with synchronous and asynchronous observer failures converted to one non-retryable `ext_event_observer_failed` rejection that cannot poison an unrelated correlation or be erased by nominal success.
- Added Set-backed `retainDelegationHeartbeat`, `releaseDelegationHeartbeat`, and `getDelegationConnectionSnapshot` APIs with duplicate-safe refcounting, one 20-second timer, one outstanding nonce, persisted miss state, and deterministic teardown/reconnect behavior.
- Preserved the ordinary 25-second bridge keepalive when no delegation owner is retained and prevented active heartbeat recovery from sending restart, resume, or work-replay frames.
- Extended the daemon's existing ping branch with an exact closed parser for legacy two-field pings and additive bounded-nonce pings, echoing the exact nonce without logging, storing, routing, or treating it as authority.
- Pinned Manifest V3 to Chrome 116 while retaining the exact existing permissions, host permissions, content scripts, background worker, and bridge load order, with no `nativeMessaging`, native-host, shell, process, or daemon-restart path.
- Added deferred-promise, fake-clock, compiled-daemon, source-shape, manifest, and compatibility evidence for ordering, isolated failure, refcounting, stale/wrong/duplicate acknowledgement, two-versus-three misses, close/reconnect, and no-native recovery boundaries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Serialize async bridge event observers behind final responses** — `11c64684`
2. **Task 2: Add one acknowledged active-delegation heartbeat** — `6b618f8b`
3. **Task 3: Pin Chrome 116 compatibility and the no-native recovery boundary** — `4db55c4f`

## Files Created/Modified

- `extension/ws/mcp-bridge-client.js` — Adds per-correlation observer tails plus active-delegation heartbeat ownership, acknowledgement, miss, persistence, and reconnect state.
- `mcp/src/bridge.ts` — Validates exact legacy/additive heartbeat frames and echoes a bounded nonce byte-for-byte.
- `extension/manifest.json` — Sets `minimum_chrome_version` to exact string `116` with no authority expansion.
- `tests/mcp-bridge-client-lifecycle.test.js` — Proves async observer barriers/failure isolation and the full fake-clock heartbeat matrix.
- `tests/agent-grace.test.js` — Pins the independent 10-second agent transport grace, 20-second/three-miss heartbeat, and no restart/native/work-dispatch authority.
- `tests/mcp-version-parity.test.js` — Pins Chrome 116, unchanged manifest/load surfaces, data-only doctor/setup copy, and the no-native boundary.
- `tests/mcp-reverse-channel-contract.test.js` — Proves compiled daemon legacy compatibility, exact nonce echo, strict boundaries, malformed-frame rejection, and non-authority semantics.

## Decisions Made

- Global observers are snapshotted when each event arrives, then executed in registration order on that event's pending-correlation tail. A later registration cannot retroactively enter an already received event.
- A final frame removes the request from the live pending map before awaiting its captured tail, so later or duplicate frames cannot extend, replay, or resettle the completed correlation.
- The heartbeat permits only one outstanding nonce. Each interval first classifies the prior nonce as missed when still outstanding, then sends a fresh nonce; two misses remain connected and the third publishes disconnected.
- An exact current acknowledgement may restore connected state after a miss classification, but disconnect alone never implies daemon restart and never starts or replays delegated work.
- The active loop replaces, rather than supplements, the ordinary bridge timer. Final owner release restores the legacy timer; socket close always clears the active timer while retaining owner intent for one clean reconnect timer.
- Doctor and provider-setup recovery remain data-only future UI dispositions. The extension bridge cannot execute their commands, wake or restart the daemon, or invoke native/shell/process APIs.

## Deviations from Plan

None — all three tasks, declared interfaces, threat mitigations, and automated acceptance gates were implemented as planned.

## Issues Encountered

- No implementation blocker was encountered. Repeated daemon builds regenerated compiled artifacts as expected, while the protected user-owned `mcp/build/index.js` bytes remained exactly SHA-256 `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4` and were never staged.
- No live Chrome service-worker longevity, real-daemon heartbeat timing, or physical disconnect UAT was run. Per user instruction, all live/human UAT remains pending for the single milestone-end sweep.

## User Setup Required

None for the bridge, daemon parser, and manifest compatibility changes. Live Chrome/daemon corroboration remains deferred to the milestone-end UAT ledger.

## Next Phase Readiness

- Plan 61-04 can attach exact server delegation ids to minted extension agents and add sealed mapped-tab hold leases without changing bridge event or heartbeat contracts.
- Plan 61-06 can retain/release the shared heartbeat from the sole controller and consume persisted connection snapshots without creating another timer or restart inference.
- Plan 61-07 can render disconnected doctor/setup dispositions as data-only UI actions while relying on the no-native extension boundary through Phase 62.

## Verification

- `npm --prefix mcp run build` — PASS
- `shasum -a 256 mcp/build/index.js` — PASS (`6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`)
- `node tests/mcp-bridge-client-lifecycle.test.js` — PASS (188 passed, 0 failed)
- `node tests/agent-grace.test.js` — PASS
- `node tests/mcp-version-parity.test.js` — PASS (40 passed, 0 failed)
- `node tests/mcp-reverse-channel-contract.test.js` — PASS
- `git diff --check` on every task's declared files — PASS
- Live UAT — not run; deferred to the milestone-end sweep by explicit user instruction

## Self-Check: PASSED

All seven declared artifacts exist, all three atomic task commits are present, the fresh compiled-daemon and four-test plan gate passes, the protected build hash is unchanged, no generated build output was staged, and no live/manual result or later integration behavior was claimed.

---
*Phase: 61-delegation-ux-sw-eviction-persistence*
*Completed: 2026-07-14*
