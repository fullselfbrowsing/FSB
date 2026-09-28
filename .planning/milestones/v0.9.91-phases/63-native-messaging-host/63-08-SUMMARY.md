---
phase: 63-native-messaging-host
plan: "08"
subsystem: extension-native-wake
tags: [native-messaging, mv3, delegation, preflight, security, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Exact v1 native protocol, wake outcomes, stable host name, and shell-free serve handoff from Plans 03-04
  - phase: 61-delegation-ux-sw-eviction-persistence
    provides: Pure background-authoritative delegation preflight and authenticated bridge state
provides:
  - One background-only silent registration probe and timed one-flight native wake controller
  - Agent-offline-only wake composition with intent-scoped checking fanout, bounded bridge wait, and one direct preflight rerun
  - The sole additive nativeMessaging manifest permission with byte-pinned surrounding manifest state
affects: [63-09, 63-10, delegation-offline-ux, extension-manifest]

tech-stack:
  added: []
  patterns:
    - Attach a safe attempt token to the shared work Promise so concurrent callers share native work but retain per-intent fanout
    - Treat native success as reachability only and re-enter existing authenticated authority through one direct pure-preflight rerun
    - Pin a one-line manifest exception by hashing the exact prior bytes after removing that line

key-files:
  created:
    - extension/utils/native-host-wake.js
    - tests/native-host-background-wake.test.js
  modified:
    - extension/background.js
    - extension/manifest.json
    - tests/mcp-bridge-background-dispatch.test.js

key-decisions:
  - "The native helper owns both Chrome native APIs and exposes only frozen probePresence, getPresence, and ensureWake operations; presence and cooldown remain service-worker-memory facts."
  - "Only the exact existing agent_offline preflight result may join native wake; every non-offline result returns unchanged with zero native calls."
  - "An exact positive native result waits for ordinary bridge connectivity and then calls fsbDelegationPreflightResult directly once; native lifecycle never grants pairing, consent, session, tab, or start authority."
  - "The manifest delta is one nativeMessaging line, and an exact baseline hash plus extension-wide source scan protects all other bytes and authority boundaries."

requirements-completed: [NATIVE-02, NATIVE-03]

duration: 28 min
completed: 2026-07-17
---

# Phase 63 Plan 08: Background-Owned Native Wake Orchestration Summary

**The extension can now probe native-host registration silently and make one closed wake attempt only after authoritative delegated preflight reports `agent_offline`, while authenticated bridge/preflight authority remains unchanged.**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-17T18:51:41Z
- **Completed:** 2026-07-17T19:19:52Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a classic-script `FsbNativeHostWake` helper with a 250 ms no-message registration probe, in-memory `present` / `absent` / `unknown` advice, and no persistence or UI authority.
- Added a crypto-tokened one-flight wake operation with one `sendNativeMessage`, a 12-second timeout, a five-second failure cooldown, exact v1 response validation, and late-settlement fencing.
- Loaded the helper only in the service worker and started its advisory probe after bridge dependencies without awaiting or broadcasting it.
- Extended the internal preflight request with an optional safe `intentId`; only exact `agent_offline` callers join wake, and each current caller receives one closed `{type, attemptId, intentId}` checking event.
- Coalesced positive native continuations by attempt, waited at most five seconds for ordinary bridge connectivity, and returned one direct rerun of the existing pure preflight unchanged.
- Added only `nativeMessaging` to the manifest and pinned every other manifest byte plus the background-only native API/host-name surface.

## Task Commits

The two behavior tasks preserve separate RED and GREEN evidence; the permission/source-authority task is one verified implementation commit:

1. **Task 63-08-01 RED: Closed native wake controller contract** — `d43cb8c5` (test)
2. **Task 63-08-01 GREEN: Silent probe and one-flight wake controller** — `ba3abb91` (feat)
3. **Task 63-08-02 RED: Offline-only background integration matrix** — `b3871c75` (test)
4. **Task 63-08-02 GREEN: Bridge-gated one-rerun composition** — `fcb5c98b` (feat)
5. **Task 63-08-03: Additive permission and authority pins** — `710c9908` (feat)

## Files Created/Modified

- `extension/utils/native-host-wake.js` — Owns the frozen host/protocol constants, silent advisory probe, strict response parser, shared timed wake Promise, cooldown, and late fence.
- `extension/background.js` — Loads and probes the helper, validates optional intent ids, gates wake on exact offline authority, fans out closed checking events, coalesces bridge readiness, and reruns pure preflight once.
- `extension/manifest.json` — Adds exactly one `nativeMessaging` permission line.
- `tests/native-host-background-wake.test.js` — Covers native runtime/port/timer races, exact parsing, concurrency, background convergence, zero-replay counters, manifest bytes, and extension-wide authority ownership.
- `tests/mcp-bridge-background-dispatch.test.js` — Pins helper load order, sole probe/wake sites, exact event fields, bridge timeout/rerun composition, and native-free bridge/preflight utilities.

## Decisions Made

- Kept probe presence advisory and memory-only. A successful open port says only that Chrome could launch the registered host; it never creates a readiness, pairing, or install claim.
- Tagged the one-flight Promise with a non-enumerable safe attempt id. This makes the shared operation observable to background composition without widening its resolved result or issuing another native request.
- Preserved the original exact offline result before wake. Native failure, timeout, malformed success, bridge timeout, and rerun failure all return that captured object shape without optimistic mutation.
- Considered a connected ordinary bridge sufficient to rerun preflight even when unpaired. The existing pure preflight remains responsible for returning the exact `agent_unpaired` disposition.
- Used normal runtime fanout only for the browser-safe checking event; the continuation does not self-dispatch, recurse into the command, replay a message, or enter start/consent/controller/tab paths.

## TDD Evidence

- **Task 1 RED:** the controller section failed immediately because `extension/utils/native-host-wake.js` did not exist.
- **Task 1 GREEN:** 52 controller assertions passed across silent probe, exact positive response, malformed/prototype/lastError failure, timeout/cooldown/late races, one-flight concurrency, and zero secret/start/browser authority.
- **Task 2 RED:** the background integration section reported 29 expected failures with 22 existing assertions green because helper loading, boot probing, offline wake, checking fanout, bridge wait, and direct rerun did not yet exist.
- **Task 2 GREEN:** the complete native suite passed 103 assertions and the existing MCP background-dispatch suite passed 306 assertions, including exact call counts and no-replay source contracts.
- **Task 3 verification:** the manifest/authority section passed eight assertions proving one permission line, the exact prior manifest hash after line removal, one preflight wake join, and no native authority in any other extension module.

## Security and Privacy

- T63-01 remains closed: only ordinary own-data objects with the exact v1 fields, matching crypto correlation, and approved outcome/reason pairs can become a positive reachability fact; prototype, extra-key, mismatched, malformed, and late responses fail closed.
- T63-10 is mitigated by a no-message boot probe and the sole actual wake call living after exact authoritative `agent_offline` gating.
- T63-11 is mitigated by safe attempt/correlation ids, one shared work Promise, one native message, bounded timeout/cooldown, token-checked cleanup, and one intent-scoped event per joining caller.
- T63-12 remains closed because native success waits for existing bridge facts and reruns the existing pure preflight; it transports no task, provider, pairing, secret, session, tab, consent, or delegated-start authority.
- The helper cannot access storage, pairing state, task text, browser tabs/windows, the side panel, or delegation start APIs.

## Deviations from Plan

None.

## Issues Encountered

- The first integration implementation run exposed a VM extraction boundary: new wake constants initially sat before the focused composition slice. Moving the closed helper block beside the pure preflight composition made the production and harness boundary explicit.
- The shared worktree retained hundreds of unrelated planning-file deletions plus unrelated generated/build modifications. Every plan commit used exact path staging, leaving those user-owned changes unstaged and unmodified.
- No live Chrome, daemon, installed native host, registry, filesystem ownership, or paired/unpaired browser UAT was run.

## Known Pending Evidence

- Real Chrome native API error timing, native-port disconnect behavior, and MV3 service-worker timer/eviction scheduling remain `human_needed`.
- Live paired and unpaired daemon reconnect convergence, Chrome host discovery, and installed native execution remain pending the milestone-end UAT sweep.
- Plan 63-09 still needs to render the approved intent-fenced checking state in the existing delegation card; this plan supplies the closed event and Promise behavior only.

## User Setup Required

None during autonomous implementation.

## Verification

- `node tests/native-host-background-wake.test.js` — PASS: 111 assertions.
- `node tests/mcp-bridge-background-dispatch.test.js` — PASS: 306 assertions.
- Syntax checks passed for the native helper, background service worker, and dedicated test.
- The manifest diff from the pre-permission commit is exactly one `nativeMessaging` line.
- Extension-wide source scans found `connectNative`, `sendNativeMessage`, and the exact host name only in `extension/utils/native-host-wake.js`; the sole actual wake join is inside background preflight.
- `git diff d43cb8c5^..710c9908 --check` is clean.

## Next Phase Readiness

- Plan 63-09 can pass safe intent ids from the existing Send flow and render `FSB_NATIVE_WAKE_CHECKING` only for the matching pending intent.
- The wake controller and background continuation expose no replay or UI authority, so the next plan can remain a presentation-only consumer of exact background facts.
- Live browser/native evidence stays pending for the single milestone-end sweep.

## Self-Check: PASSED

- Five task-level commits are present, including both RED/GREEN pairs.
- All five planned source/test files exist and are committed.
- The final focused suites, syntax checks, exact manifest diff, source-authority scan, and whitespace check pass.
