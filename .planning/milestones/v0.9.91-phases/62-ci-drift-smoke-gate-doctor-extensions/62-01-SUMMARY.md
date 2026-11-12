---
phase: 62-ci-drift-smoke-gate-doctor-extensions
plan: "01"
subsystem: agent-adapter-compatibility
tags: [compatibility-matrix, protocol-drift, claude-code, production-parser, ci]

requires:
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Closed five-method registry, production stream parser, and truthful schema-derived Claude fixture
provides:
  - Exact deeply frozen daemon compatibility matrix with strict fail-closed classification
  - Matrix-backed Claude detection and profile selection without duplicated version policy
  - Registry-driven production-parser drift smoke wired directly into CI
affects: [62-02, 62-03, 62-04, 62-05, 62-06, 64-opencode-adapter, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - One exact daemon-owned policy object feeds detection, diagnostics, CI, and browser-safe projections
    - Registry/matrix/fixture bijection is checked before production-parser replay
    - Unsupported detection retains only detector-approved local path/version evidence

key-files:
  created:
    - mcp/src/agent-providers/compatibility.ts
    - tests/mcp-adapter-compatibility.test.js
    - tests/mcp-agent-drift-smoke.test.js
  modified:
    - mcp/src/agent-providers/claude-detect.ts
    - mcp/src/agent-providers/claude-profile.ts
    - tests/mcp-claude-code-adapter.test.js
    - .github/workflows/ci.yml

key-decisions:
  - "Classify only the inclusive committed fixture range as supported; newer same-major evidence is degraded but remains start-eligible, while every other invalid or unsupported family fails closed."
  - "Keep safe binary/version evidence on unsupported detector results for local doctor diagnostics, while leaving profile/start authority null."
  - "Drive the CI smoke from production registry ids and adapter parseEvents implementations, preserving schema-derived-contract and liveCapturePending truth exactly."

patterns-established:
  - "Compatibility authority: exact own-data validation, strict numeric semantic versions, recursively frozen clones, and one closed reason vocabulary."
  - "Safe browser projection: only schemaVersion, checkedAt, and adapter id/label/status/reason cross the projection boundary."
  - "Offline drift gate: committed JSONL enters the registered production parser; no test-only normalizer, provider process, account, browser, or network is involved."

requirements-completed: [DRIFT-01, DRIFT-04]

duration: 15 min
completed: 2026-07-16
---

# Phase 62 Plan 01: Compatibility Authority and Drift Gate Summary

**A single frozen Claude compatibility policy now controls detection and safe projection, while CI replays the honestly labeled fixture through the registered production parser and fails on roster, profile, field, event, framing, or version drift.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T17:15:11Z
- **Completed:** 2026-07-16T17:30:02Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added one exact `schemaVersion: 1`, Claude-only, deeply frozen compatibility matrix with strict prototype/accessor/size/path/version validation, all closed compatibility reasons, and a secret-free safe snapshot projector.
- Refactored Claude detection and spawn-profile selection to consume that matrix, preserving the five-method adapter contract and fixed spawn policy while distinguishing supported, degraded/start-eligible, and unsupported evidence.
- Added a generalized registry/matrix/fixture smoke that asserts raw init/result fields, provider-native and normalized sequences, one terminal result, production-parser negative behavior, fixture/profile agreement, and compatibility boundaries.
- Added the exact `Phase 62 adapter drift smoke` CI step without changing the root serial test owner reserved for Plan 62-06.

## Task Commits

Each task was committed atomically:

1. **Task 62-01-01: Define the frozen compatibility matrix and pure classifier** — `805439a3` (feat)
2. **Task 62-01-02: Refactor Claude detection and profile selection onto the matrix** — `b8514d55` (refactor)
3. **Task 62-01-03: Add the registry-driven production-parser drift smoke and CI gate** — `d8f176ab` (test)

## Files Created/Modified

- `mcp/src/agent-providers/compatibility.ts` — Canonical matrix, exact validator, version extraction/classification, and safe projection.
- `mcp/src/agent-providers/claude-detect.ts` — Retained-path probing backed solely by canonical compatibility classification.
- `mcp/src/agent-providers/claude-profile.ts` — Fixed spawn profile reads the canonical profile version.
- `tests/mcp-adapter-compatibility.test.js` — Deep-freeze, strict-boundary, closed-reason, hostile-input, and safe-projection contract.
- `tests/mcp-claude-code-adapter.test.js` — Supported/degraded/unsupported detector and unchanged spawn/adapter regression coverage.
- `tests/mcp-agent-drift-smoke.test.js` — Registry-driven production-parser fixture replay and deterministic negative controls.
- `.github/workflows/ci.yml` — Named direct drift-smoke invocation after the MCP build.

## Decisions Made

- Kept the tested-through bound equal to the exact committed fixture/profile version instead of claiming unverified later versions as supported.
- Kept same-major newer versions start-eligible but explicitly degraded; compatibility remains observational and does not bypass existing detector/supervisor requirements.
- Retained a safely resolved binary on unsupported or unparseable evidence for later local doctor output, while leaving `installed: false` and `profileVersion: null`.
- Preserved the fixture labels `schema-derived-contract`, `liveCapturePending: true`, and `human_needed`; no automated test is represented as genuine live provenance.

## TDD Evidence

- **Task 1 RED:** the contract test failed because the compatibility module did not exist; **GREEN:** the exact matrix/classifier/projector suite passed.
- **Task 2 RED:** the adapter test failed because below-range evidence discarded its safe retained path; **GREEN:** all version boundaries and unchanged spawn/profile behavior passed.
- **Task 3 RED:** the generalized harness failed because the named CI entry was absent; **GREEN:** the new harness and retained Phase 60 fixture suite passed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- TypeScript did not retain a nullable canonical-row narrowing inside later closures; small `requireClaudeCompatibility` helpers make the load-time invariant explicit and compile safely.
- The first RED wrapper used zsh's reserved `status` name before its restore line. The protected MCP entry was immediately restored from the byte-exact backup and all four protected hashes were reverified; subsequent wrappers used `exit_code` and restored on every build.

## Known Stubs

None. Claude authentication remains deliberately `unknown` under the existing non-inference contract, and genuine installed-CLI provenance remains explicitly deferred to the milestone-end UAT gate.

## User Setup Required

None - no provider binary, account, network, browser, or external service was required.

## Verification

- `npm --prefix mcp run build && node tests/mcp-adapter-compatibility.test.js` — PASS
- `npm --prefix mcp run build && node tests/mcp-claude-code-adapter.test.js && node tests/mcp-adapter-compatibility.test.js` — PASS
- `npm --prefix mcp run build && node tests/mcp-agent-drift-smoke.test.js && node tests/mcp-agent-stream-fixture.test.js` — PASS
- All focused commands completed in under five seconds and restored protected `mcp/build/index.js` before staging.
- Fixture bytes and exact `schema-derived-contract` / `liveCapturePending: true` provenance remained unchanged.
- No live CLI, network, browser, native host, authentication source, or UAT was invoked.

## Next Phase Readiness

- Plan 62-02 can collect local adapter/bridge-auth diagnostics from the canonical matrix and detector without creating a second policy engine.
- Plan 62-03 can expose only the established safe projection over a separately authenticated read-only request.
- No blocker remains; all live doctor/browser corroboration stays pending for the single milestone-end UAT sweep.

## Self-Check: PASSED

- All seven declared implementation/test/CI artifacts and this summary exist.
- Task commits `805439a3`, `b8514d55`, and `d8f176ab` are present.
- Every plan-level focused verification and protected-hash check passes.

---
*Phase: 62-ci-drift-smoke-gate-doctor-extensions*
*Completed: 2026-07-16*
