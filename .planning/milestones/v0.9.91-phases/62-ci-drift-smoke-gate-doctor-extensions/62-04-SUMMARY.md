---
phase: 62-ci-drift-smoke-gate-doctor-extensions
plan: "04"
subsystem: agent-protocol-drift-diagnostics
tags: [agent-protocol-drift, diagnostics, throttling, delegation, privacy]

requires:
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Production Claude stream parser, typed protocol-drift errors, and supervised delegation lifecycle
  - phase: 61-service-worker-eviction-safe-delegation-lifecycle
    provides: Background-owned authoritative final settlement and exact-once delegation controller
  - phase: 62-ci-drift-smoke-gate-doctor-extensions
    provides: Canonical shipped-adapter roster and closed compatibility vocabulary from Plans 01 and 03
provides:
  - Exact three-label protocol-drift detail on authoritative daemon terminals
  - Dual-context exact-shape reporter with a true per-adapter ten-second pre-throttle
  - Background exact-once final reporting with a bounded 512-entry FIFO delegation set
  - Hostile-input, leak, throttle-boundary, replay, and settlement-isolation regression coverage
affects: [62-05, 62-06, milestone-end-uat]

tech-stack:
  added: []
  patterns:
    - Project typed failures into closed labels before they cross a process boundary
    - Throttle before invoking diagnostics helpers that append on every call
    - Keep observational reporting isolated from authoritative lifecycle settlement

key-files:
  created:
    - extension/utils/agent-protocol-drift-diagnostics.js
    - tests/agent-protocol-drift-diagnostics.test.js
  modified:
    - mcp/src/agent-providers/spawn-supervisor.ts
    - extension/background.js
    - tests/mcp-spawn-supervisor.test.js
    - tests/mcp-reverse-channel-contract.test.js
    - tests/mcp-bridge-background-dispatch.test.js

key-decisions:
  - "Map every typed parser reason to one closed expected-family label and collapse untyped drift to adapter_contract/protocol_drift."
  - "Perform the ten-second admission check before rateLimitedWarn because that existing helper writes every invocation to the ring."
  - "Record a validated delegation ID before invoking the reporter so a throwing observational sink cannot multiply later attempts."
  - "Keep exact-once IDs private in a 512-entry insertion-ordered Set and never include them in diagnostic context or logs."

patterns-established:
  - "Closed drift projection: terminals expose only adapterId, expected, and observed labels, never provider/parser/error payloads."
  - "True pre-throttle: suppressed events do not invoke the shared sink and therefore create zero diagnostic-ring entries."
  - "Observational failure isolation: validator, reporter, and diagnostics-module failures cannot alter controller settlement or cleanup."

requirements-completed: [DRIFT-03]

duration: 17 min
completed: 2026-07-16
---

# Phase 62 Plan 04: Protocol Drift Diagnostics Summary

**Typed provider-protocol drift now crosses the daemon boundary as three closed labels and is recorded through a true ten-second pre-throttle at most once per authoritative delegation, without changing terminal settlement.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-07-16T18:34:28Z
- **Completed:** 2026-07-16T18:51:03Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added an exhaustive typed-reason projection in the spawn supervisor so authoritative `agent_protocol_drift` terminals contain exactly `adapterId`, `expected`, and `observed`, while generic drift collapses to one safe fallback pair.
- Added a browser/Node diagnostics utility that exact-validates plain data records, rejects hostile or secret-bearing input, and performs its own deterministic per-adapter ten-second admission check before calling the existing ring-writing warning helper.
- Wired reporting only into the authoritative background final-settlement path, with a private 512-entry FIFO seen-ID set that prevents duplicate/replayed finals from multiplying reporter calls.
- Proved reporter absence and validator/reporter exceptions cannot alter the existing controller terminal event, profile cleanup, persistence, or lifecycle behavior.

## Task Commits

Each task was committed atomically:

1. **Task 62-04-01: Carry sanitized drift detail to the daemon terminal** — `68725d71` (feat)
2. **Task 62-04-02: Build a true per-adapter pre-throttled diagnostics reporter** — `4bde1312` (feat)
3. **Task 62-04-03: Report each authoritative drift final exactly once in background** — `caa0365f` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/spawn-supervisor.ts` — Exhaustive typed drift mapping, safe generic fallback, and additive exact terminal detail captured before generic normalization.
- `extension/utils/agent-protocol-drift-diagnostics.js` — Dual-context validator, bounded timestamp state, injected clock/sink seams, and true ten-second pre-throttle.
- `extension/background.js` — Dependency-ordered utility load and one guarded authoritative-final reporter call with bounded FIFO deduplication.
- `tests/mcp-spawn-supervisor.test.js` — All typed reason families, generic fallback, canary non-leak, cleanup, and exact-once terminal coverage.
- `tests/mcp-reverse-channel-contract.test.js` — Additive drift detail contract while retaining the exact five transport failures.
- `tests/agent-protocol-drift-diagnostics.test.js` — Exact-shape, hostile input, label mapping, t=0/boundary/rollback, sink isolation, and non-leak coverage.
- `tests/mcp-bridge-background-dispatch.test.js` — First/duplicate/replayed final, distinct ID, capacity eviction, reconnect/panel exclusion, malformed detail, and settlement-isolation coverage.

## Decisions Made

- Enforced the typed expected/observed pair mapping, rather than validating both labels independently, so background accepts only combinations the authoritative daemon can produce.
- Treated clock rollback as a new admission boundary while rejecting invalid clocks, preserving deterministic behavior across injected clocks and service-worker timing changes.
- Updated the admission timestamp before invoking the sink and marked a delegation seen before reporter invocation; throwing diagnostics remain throttled and exact-once.
- Kept the reporter call synchronous and best-effort ahead of the existing controller call, fully caught inside its own boundary so lifecycle authority remains unchanged.

## TDD Evidence

- **Task 1 RED:** the supervisor contract failed because drift terminals had no detail; **GREEN:** MCP build, supervisor, and reverse-channel gates passed with all fourteen typed reason families plus generic fallback covered.
- **Task 2 RED:** the focused test failed with `MODULE_NOT_FOUND` for the planned reporter; **GREEN:** reporter, redaction, and diagnostics-ring suites passed, including zero sink calls below the ten-second boundary.
- **Task 3 RED:** the background harness failed because the bounded exact-once final seam was absent; **GREEN:** the expanded background suite passed 275 assertions, the controller regression passed 39 cases, and the MCP supervisor remained green.
- Final accumulated build, supervisor, reverse-channel, diagnostics, ring, background, and controller gates all passed after the implementation commits.

## Security and Privacy

- Daemon terminals and diagnostic contexts contain only the canonical adapter ID and closed expected/observed labels, each bounded to 64 characters.
- Provider output, raw JSONL, parser lines/indexes/paths, error message/stack/cause, task, prompt, session, version, filesystem path, token, and secret material are excluded and covered by sentinel tests.
- Accessor-bearing, inherited, symbol-keyed, extra-key, custom-prototype, oversized, unknown-adapter, unknown-label, and mismatched-label values fail closed without logging.
- Delegation IDs exist only in a private bounded deduplication set; they never enter the reporter context, warning helper, ring buffer, or logs.
- Reporting is observational: missing modules, invalid data, clock failure, and throwing validators/reporters cannot change terminal code, tree settlement, cleanup, or controller persistence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The MCP build rewrites the protected generated bundle as expected; the pre-task backup was restored after every build and its required hash was re-verified.

## Known Stubs

None. Live installed-provider, browser, native-host, and human verification remains intentionally deferred to the single milestone-end UAT sweep.

## User Setup Required

None - no installed provider CLI, account, external network, browser, native host, wake flow, or human UAT was required.

## Verification

- `npm --prefix mcp run build` — PASS
- `node tests/mcp-spawn-supervisor.test.js` — PASS
- `node tests/mcp-reverse-channel-contract.test.js` — PASS
- `node tests/agent-protocol-drift-diagnostics.test.js` — PASS
- `node tests/redact-for-log.test.js` — PASS
- `node tests/diagnostics-ring-buffer.test.js` — PASS
- `node tests/mcp-bridge-background-dispatch.test.js` — PASS, 275 assertions
- `node tests/delegation-controller.test.js` — PASS, 39 cases
- JavaScript syntax checks and `git diff --check` across all Plan 04 implementation/test files — PASS
- Protected `mcp/build/index.js` and the three pre-existing generated showcase files retain their exact required SHA-256 hashes.
- No live provider CLI, external network, browser, native host, wake flow, or human UAT was invoked.

## Next Phase Readiness

- Remaining Phase 62 plans can consume actionable drift diagnostics without parsing provider output or gaining process/lifecycle authority.
- Milestone verification can audit DRIFT-03 through deterministic synthetic evidence; genuine installed-provider and rendered-browser checks remain deferred to the requested final UAT sweep.
- No blocker remains for autonomous continuation.

## Self-Check: PASSED

- All seven implementation/test artifacts and this summary exist.
- Task commits `68725d71`, `4bde1312`, and `caa0365f` are present.
- All task-level and accumulated synthetic gates, syntax checks, diff checks, and protected-hash checks pass.

---
*Phase: 62-ci-drift-smoke-gate-doctor-extensions*
*Completed: 2026-07-16*
