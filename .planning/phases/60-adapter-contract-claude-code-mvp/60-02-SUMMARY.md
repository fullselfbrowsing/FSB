---
phase: 60-adapter-contract-claude-code-mvp
plan: "02"
subsystem: agent-adapter-protocol
tags: [claude-code, jsonl, zod, async-iterable, protocol-drift]

requires:
  - phase: 60-01
    provides: exact five-method adapter contract, retained Claude detection, and closed spawn profile
provides:
  - bounded incremental Claude stream-json framing and strict provider-neutral normalization
  - truthful schema-derived 2.1.177 contract fixture with deterministic mutation coverage
  - concrete exact-five-method Claude Code adapter with injected tree-kill authority
affects: [60-03, 60-04, phase-61, phase-62, phase-64, phase-65]

tech-stack:
  added: []
  patterns:
    - provider JSON is validated and normalized at one async-iterable boundary
    - terminal result is withheld until EOF confirms the complete stream is valid
    - fixture provenance is machine-asserted separately from real-environment corroboration

key-files:
  created:
    - mcp/src/agent-providers/claude-stream.ts
    - mcp/src/agent-providers/claude-code.ts
    - tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json
    - tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl
    - tests/mcp-agent-stream-fixture.test.js
  modified:
    - tests/mcp-claude-code-adapter.test.js

key-decisions:
  - "Withhold the normalized result event until stdout reaches EOF, so trailing protocol drift cannot expose terminal success first."
  - "Treat the checked-in 2.1.177 bytes only as a schema-derived contract; recorded provenance remains human_needed at the milestone-end UAT gate."
  - "Keep the concrete adapter process-free by injecting detection overrides, the parser, and tree-kill while using the closed spawn-profile builder."

patterns-established:
  - "Fail-loud stream boundary: unknown, malformed, misordered, or oversized input raises agent_protocol_drift without raw input or replay."
  - "Closed adapter composition: exactly detect, buildSpawn, parseEvents, kill, and caps are own callable properties."

requirements-completed:
  - ADAPT-01
  - ADAPT-02
  - CLAUDE-01
  - CLAUDE-02
  - CLAUDE-03
  - CLAUDE-04

duration: 8min
completed: 2026-07-14
---

# Phase 60 Plan 02: Claude Stream Boundary and Concrete Adapter Summary

**Bounded Claude JSONL normalization, a truthful offline 2.1.177 contract, and an exact-five-method process-free adapter composition**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-14T17:05:36Z
- **Completed:** 2026-07-14T17:13:21Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added incremental byte framing with UTF-8 validation, LF/CRLF and final-line handling, a 256 KiB per-line bound, session/order enforcement, init surface attestation, and strict normalized events.
- Added a sanitized schema-derived fixture whose manifest explicitly keeps CLAUDE-03/D-27 recorded provenance `human_needed`, plus EV-01 through EV-08 framing, drift, sanitization, and resource assertions.
- Added `createClaudeCodeAdapter` with only the five shared methods, declarative spawn building, direct drift propagation, injected tree cleanup, and honest task-only capabilities.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the bounded incremental Claude JSONL normalizer** — `8bc2fcab`
2. **Task 2: Add the truthful provisional contract fixture and deterministic mutation matrix** — `5a3e88a7`
3. **Task 3: Compose the concrete Claude adapter from the closed profile and parser** — `cb5cc020`

## Files Created/Modified

- `mcp/src/agent-providers/claude-stream.ts` — Frames, validates, attests, orders, and normalizes Claude stream-json output.
- `mcp/src/agent-providers/claude-code.ts` — Composes the exact five-method Claude adapter without process authority.
- `tests/fixtures/agent-streams/claude-code-2.1.177/manifest.json` — Pins profile, sanitization, expected sequence, sources, and honest provenance status.
- `tests/fixtures/agent-streams/claude-code-2.1.177/contract-stream.jsonl` — Supplies deterministic synthetic known-shape bytes for offline CI.
- `tests/mcp-agent-stream-fixture.test.js` — Covers every fixture byte split, required-field and drift mutations, terminal integrity, and stream bounds.
- `tests/mcp-claude-code-adapter.test.js` — Covers concrete method exactness, dependency delegation, profile purity, and parser drift propagation.

## Decisions Made

- A provider `result` is retained internally and emitted only after the complete stdout stream validates at EOF.
- A CR byte used by CRLF framing is delimiter overhead rather than part of the 256 KiB JSON content limit.
- The checked-in fixture cannot promote recorded provenance; only a genuine sanitized 2.1.177 comparison at the final UAT gate can change `liveCapturePending`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prevented a valid result from escaping before trailing drift**
- **Found during:** Task 2 mutation expansion
- **Issue:** The first implementation yielded `result` immediately, so a duplicate or trailing event could be detected only after consumers had observed terminal success.
- **Fix:** Retained the result until EOF and emitted it only after the entire stream passed ordering validation.
- **Files modified:** `mcp/src/agent-providers/claude-stream.ts`, `tests/mcp-agent-stream-fixture.test.js`
- **Verification:** Duplicate-result and all other negative mutations emit zero result events; the valid fixture still emits exactly one terminal result.
- **Committed in:** `5a3e88a7`

**2. [Rule 1 - Bug] Counted CRLF delimiter overhead correctly at the exact line bound**
- **Found during:** Task 2 boundary expansion
- **Issue:** A valid 256 KiB JSON object followed by CRLF was counted as 256 KiB plus one and rejected.
- **Fix:** Allowed exactly one trailing CR delimiter byte while retaining a hard 256 KiB JSON-content limit.
- **Files modified:** `mcp/src/agent-providers/claude-stream.ts`, `tests/mcp-agent-stream-fixture.test.js`
- **Verification:** Exact-limit LF and CRLF cases pass; one additional JSON byte fails with `line_too_large`.
- **Committed in:** `5a3e88a7`

**Total deviations:** 2 auto-fixed bugs. **Impact:** Both fixes strengthen terminal truthfulness and framing correctness without expanding scope.

## Issues Encountered

Two delegated executor attempts stopped before producing edits. Execution continued through the workflow's local fallback; all three tasks still completed with their planned atomic commits and acceptance gates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 60-03 can bind the adapter's injected kill method to deterministic process-tree and orphan-recovery helpers.
- The schema-derived fixture is automated/source green. Genuine 2.1.177 provenance remains explicitly `human_needed` for the single milestone-end UAT gate and is not a blocker for Plan 60-03.

## Verification

- `npm --prefix mcp run build` — PASS
- `node tests/mcp-agent-provider-contract.test.js` — PASS
- `node tests/mcp-claude-code-adapter.test.js` — PASS
- `node tests/mcp-agent-stream-fixture.test.js` — PASS; output explicitly reports recorded provenance `human_needed`

## Self-Check: PASSED

All declared key files exist, all three task commits are present, and every Plan 02 acceptance/verification command passes without invoking Claude, Chrome, a model API, or a network service.

---
*Phase: 60-adapter-contract-claude-code-mvp*
*Completed: 2026-07-14*
