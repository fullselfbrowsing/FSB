---
phase: 63-native-messaging-host
plan: "04"
subsystem: native-host-daemon-composition
tags: [native-messaging, health, coalescing, child-process, one-shot, import-boundary, tdd]

requires:
  - phase: 63-native-messaging-host
    provides: Stable owned runtime layout, packaged native entry target, and workspace-preserving MCP build guard from Plan 01
  - phase: 63-native-messaging-host
    provides: Product-specific false-by-default serve readiness and bind-winner startup authority from Plan 02
  - phase: 63-native-messaging-host
    provides: Exact one-frame protocol, invocation validation, one-shot entry, and staged authority gate from Plan 03
provides:
  - Bounded exact FSB v1 health classification with incompatible-responder refusal
  - Tokened cross-process wake coalescing, health-rechecked stale quarantine, and exact-owner release
  - One detached shell-free absolute-Node serve launch followed by bounded factual readiness
  - Stable production native-host executable with lazy strict owner/runtime validation and one closed response
  - Positive source/compiled seven-module graph with exactly one child-process edge
affects: [63-05, 63-06, 63-08, native-host-installer, extension-wake]

tech-stack:
  added: []
  patterns:
    - Offline-only wake authority after bounded exact product and protocol health classification
    - Atomic token-only directory ownership with quarantine rather than process signaling
    - Lazy production composition after one complete frame and before one daemon invocation
    - Positive transitive source/compiled graph plus unique exact serve-edge proof

key-files:
  created:
    - mcp/src/native-host/platform.ts
    - mcp/src/native-host/daemon.ts
    - mcp/src/native-host/index.ts
  modified:
    - mcp/src/native-host/constants.ts
    - mcp/src/native-host/entry.ts
    - mcp/src/native-host/runtime-layout.ts
    - scripts/verify-native-host-boundary.mjs
    - tests/mcp-native-host-daemon.test.js
    - tests/mcp-native-host-protocol.test.js
    - tests/mcp-native-host-packaging.test.js

key-decisions:
  - "Only exact ready FSB v1 health may bypass or complete wake authority; every incompatible responder returns a closed unavailable fact without locking or spawning."
  - "Wake ownership is an atomic token-only directory; stale recovery rechecks health, quarantines by fresh token, and release removes only a directory proven to contain the exact owner token."
  - "The stable native-host index lazily validates its exact runtime path and closed owner marker after one complete frame, then invokes the daemon once and settles the process after one awaited response."
  - "The production graph permits only index, entry, constants, protocol, runtime-layout, platform, and daemon, with one uniquely pinned child-process import and exact serve tuple."

patterns-established:
  - "Wake barrier: exact health -> offline only -> token lock owner only -> one serve spawn -> exact readiness -> release."
  - "Coalesced loser: never rotate auth, spawn, kill, signal, or delete shared state; poll only for bounded product-specific readiness."
  - "Production input barrier: one frame -> exact runtime and owner marker -> exact Chrome origin -> one wake call -> one closed frame -> exit."

requirements-completed: [NATIVE-01, NATIVE-03]

duration: 27 min
completed: 2026-07-17
---

# Phase 63 Plan 04: Bounded Native Daemon Wake and Production Composition Summary

**The stable native host now recognizes only exact FSB readiness, coalesces concurrent offline wakes into one shell-free serve child, returns one bounded lifecycle fact, and exits without gaining agent, task, auth, browser, or process-manager authority.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-17T04:52:13Z
- **Completed:** 2026-07-17T05:19:38Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added a core-only injected platform seam and deterministic daemon state machine for the exact 500 ms / 4096-byte FSB v1 health probe, 10-second readiness deadline, 100 ms polling, and 30-second stale-lock threshold.
- Implemented atomic token-only `wake.lock` ownership, a health recheck before fresh-token stale quarantine, exact-token release, one detached `shell:false` absolute-Node `build/index.js serve --host 127.0.0.1 --port 7226` launch, sanitized Node environment, and no process signaling.
- Composed the stable packaged `native-host/index.js` entry so no-frame EOF stays inert, one valid frame lazily validates the exact runtime suffix and closed nine-field owner marker, Chrome argv independently matches the marker's sole origin, and the daemon result becomes exactly one closed response.
- Expanded the source and compiled boundary to the exact seven-module production graph, uniquely pinned its sole child-process import/call and serve tuple, and updated package fixtures to prove the stable executable and all required leaves ship.

## Task Commits

Both TDD tasks preserved separate RED and GREEN evidence:

1. **Task 63-04-01 RED: Native daemon wake matrix** — `dc8cec21` (test)
2. **Task 63-04-01 GREEN: Bounded health, token lock, and serve handoff** — `2d6dbc96` (feat)
3. **Task 63-04-02 RED: Production one-shot composition matrix** — `212eb995` (test)
4. **Task 63-04-02 GREEN: Stable production entry and exact authority graph** — `a241ea8c` (feat)

## Files Created/Modified

- `mcp/src/native-host/platform.ts` — Supplies bounded loopback HTTP, restrictive filesystem operations, clock/random/wait, the sole injected child-process edge, and production process facts.
- `mcp/src/native-host/daemon.ts` — Classifies exact health, owns tokened coalescing, launches the one fixed serve tuple, polls factual readiness, and maps all failures to closed reasons.
- `mcp/src/native-host/index.ts` — Is the stable packaged executable composition root and settles the one-shot host exit code after the awaited response.
- `mcp/src/native-host/entry.ts` — Lazily loads strict runtime ownership after a frame, validates Chrome argv against the marker origin, and invokes `wakeServeDaemon` once.
- `mcp/src/native-host/runtime-layout.ts` — Strictly derives the owned runtime from the fixed packaged entry suffix and parses the exact nine-field owner marker without gaining mutation authority.
- `mcp/src/native-host/constants.ts` — Pins the health request timeout to the frozen 500 ms contract.
- `scripts/verify-native-host-boundary.mjs` — Proves the exact source/compiled graph, allowed core imports, one child-process edge, one production invocation, exact serve tuple, and forbidden authority categories.
- `tests/mcp-native-host-daemon.test.js` — Covers health refusal, concurrency, stale quarantine, exact release, spawn/error/timeout settlement, no-kill behavior, and the end-to-end production outcome matrix.
- `tests/mcp-native-host-protocol.test.js` — Covers lazy no-frame behavior, strict marker/origin refusal, correlation preservation, one response, and content-free diagnostics.
- `tests/mcp-native-host-packaging.test.js` — Pins the seven-module fixture graph, second-child rejection, and packaged native executable/leaf roster.

## Decisions Made

- Treated `serveReady:false` as an already-owned startup in progress: the host polls it without taking a lock or spawning, so a valid bind winner retains sole startup/auth authority.
- Classified wrong product, protocol, status, JSON, version, or response size as unavailable rather than offline; an incompatible process can deny wake availability but can never be overwritten or treated as FSB.
- Stored only schema, random token, and creation time in the wake lock. No process identifier exists, and timeout never signals or kills an independently running daemon.
- Kept owner-marker loading after a complete frame so Chrome's zero-byte boot-presence probe reads no ownership file and performs no health, lock, or spawn work.
- Used the already-frozen packaged `native-host/index.js` as the actual executable root, with the main `build/index.js` reachable only as the fixed `serve` child target.

## TDD Evidence

- **Task 1 RED:** the guarded daemon suite failed because the new `mcp/build/native-host/daemon.js` module did not yet exist.
- **Task 1 GREEN:** 117 daemon assertions passed after the bounded platform/daemon implementation; the first run also exposed and corrected fake-filesystem rename bookkeeping and use of the suite's local assertion API.
- **Task 2 RED:** the guarded production section failed because `runProductionNativeHostEntry` was not yet exported.
- **Task 2 GREEN:** the protocol production section, 172 combined daemon/entry assertions, source+compiled boundary, package import-boundary fixtures, and workspace-preservation check all passed together.

## Security and Privacy

- T63-02 is mitigated by one constant-owned absolute Node/build-index tuple, `shell:false`, detached ignored stdio, sanitized `NODE_OPTIONS`/`NODE_PATH`, a unique transitive child-process edge, and rejection of agent/task/auth/browser/installer/doctor/router imports.
- T63-03 is mitigated by the 500 ms and 4096-byte bounds plus exact HTTP status, ordinary JSON object, product, bounded version, numeric protocol, and `serveReady` checks; wrong responders receive zero lock or spawn calls.
- T63-05 is mitigated by atomic token-only ownership, bounded clocks, contender polling, health-rechecked tokened quarantine, exact-token release, and the absence of every PID, kill, and signal path.
- T63-12 remains closed: stdout contains only protocol version, correlation id, lifecycle outcome, and content-free reason; marker data, paths, environment, child output, pairing, providers, agents, tasks, browser state, sessions, and secrets cannot enter the response.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Corrected the fake directory-rename model and local assertion calls.**
- **Found during:** Task 1 GREEN.
- **Issue:** The fake filesystem moved a directory map without rewriting contained path keys, so exact-token release could not reread its quarantined marker; the suite also has a local `assert()` function rather than Node's `assert.doesNotMatch` API.
- **Fix:** Rebased contained keys during fake renames and expressed source prohibitions through the suite's local assertion function.
- **Files modified:** `tests/mcp-native-host-daemon.test.js`.
- **Verification:** The guarded Task 1 suite passed all 117 assertions.
- **Committed in:** `2d6dbc96`.

**2. [Rule 3 - Blocking] Added the implied stable executable root and strict runtime leaf exports omitted from the task file list.**
- **Found during:** Task 2 production composition.
- **Issue:** Plan 01 had already frozen both POSIX and Windows launchers to `build/native-host/index.js`, while Plan 04 required runtime/owner validation through `runtime-layout.ts`; neither the executable wrapper nor strict wake-time validators existed in the Task 2 file roster.
- **Fix:** Added the nine-line `native-host/index.ts` composition root and data-only runtime/owner validation exports, then made the verifier root the actual stable executable.
- **Files modified:** `mcp/src/native-host/index.ts`, `mcp/src/native-host/runtime-layout.ts`, `tests/mcp-native-host-packaging.test.js`.
- **Verification:** Source and compiled graphs plus package dry-run inclusion pass through the guarded wrapper.
- **Committed in:** `a241ea8c`.

**3. [Rule 1 - Correctness] Scoped the installer prohibition to executable/import authority and positively rejected additional child edges.**
- **Found during:** Task 2 boundary GREEN.
- **Issue:** The initial widened graph classified data-only `INSTALL_TOKEN` and recipe fields as installer authority, while merely requiring one correct spawn pattern would not itself reject a second differently shaped child call.
- **Fix:** Kept installer module/path imports forbidden, allowed the frozen data-only recipe vocabulary, and required exactly one child-process import, one platform call, and one daemon spawn call; a malicious second-child fixture now fails.
- **Files modified:** `scripts/verify-native-host-boundary.mjs`, `tests/mcp-native-host-packaging.test.js`.
- **Verification:** Real source/compiled graphs pass and forbidden authority, stale-graph, dynamic/unresolved import, historical shim, and second-child fixtures fail closed.
- **Committed in:** `a241ea8c`.

---

**Total deviations:** 3 auto-fixed (2 correctness, 1 blocking).
**Impact on plan:** All fixes were required to make the planned production target, strict runtime leaf, deterministic tests, and one-purpose authority enforceable; no feature or live-UAT scope was added.

## Issues Encountered

- The first Task 1 GREEN run produced three harness-only failures; the production implementation already satisfied the exact spawn, health, concurrency, and timeout checks, and the corrected fake rename semantics proved exact owner release.
- The first widened source boundary correctly failed closed on `runtime-layout.ts`, revealing that the old installer token matcher conflated immutable recipe data with executable installer authority; the refined module/path rule preserves the intended prohibition.

## Known Pending Evidence

- Real detached-process behavior, scheduler timing, Chrome host lifetime, installed owner-marker/launcher behavior, and live attach/wake remain `human_needed` across macOS, Linux, and Windows for the single milestone-end UAT sweep.
- No browser, native host, real daemon wake, CLI, platform installer, or human UAT was invoked or marked passed.

## User Setup Required

None during autonomous implementation.

## Verification

- Task 1 guarded gate: `tests/mcp-native-host-daemon.test.js` — PASS, 117 assertions at Task 1 close.
- Final guarded Plan 04 gate: protocol suite, daemon/entry suite, `verify-native-host-boundary.mjs --all`, and package `import-boundary` — PASS; daemon/entry suite reports 172 assertions.
- MCP TypeScript build ran only through `scripts/run-mcp-build-preserving-workspace.mjs`; source verification ran before TypeScript and compiled verification immediately afterward.
- `git diff --check`, scoped stub scan, exact Plan 04 file audit, and unchanged CHAN/agent-provider source audit — clean.
- Protected SHA-256 values remain exact: `mcp/build/index.js` `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`; showcase `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`, `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`, `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`; Phase 62 UAT `b6895278f76c6c280e9bf727b7739cb3ad19dd5de91eef4c614d2c6d5acad00f`; agent history `93904eeba230e6542812f69892c02e7963317f7a6921fbaad76ab041589e0a58` and clean.

## Next Phase Readiness

- Plan 63-05 can materialize and register the frozen stable runtime knowing its packaged `native-host/index.js` target strictly derives ownership, invokes only the exact serve wake path, and exits after one response.
- Installer work must preserve the owner marker's exact nine-field order/content and the existing POSIX/Windows entry paths now consumed by production composition.
- No autonomous blocker remains; all genuine live/platform evidence stays deferred to the milestone-end UAT sweep.

## Self-Check: PASSED

- All ten Plan 04 implementation/test artifacts exist, including the stable compiled-entry source and strict data-only runtime leaf.
- Commits `dc8cec21`, `2d6dbc96`, `212eb995`, and `a241ea8c` exist in RED/GREEN order.
- The final guarded protocol, 172-assertion daemon/entry, source+compiled boundary, package inclusion, and workspace-preservation matrix passes.
- Protected build, showcase, Phase 62 UAT, config/archive dirt, and agent-history state remain untouched.

---
*Phase: 63-native-messaging-host*
*Completed: 2026-07-17*
