---
phase: 64-opencode-adapter
plan: "01"
subsystem: agent-provider-protocol
tags: [opencode, jsonl, protocol-drift, zod, ci]

requires:
  - phase: 60-adapter-contract-claude-code-mvp
    provides: Closed provider contract, strict Claude JSONL parser, and sanitized fixture pattern
  - phase: 62-ci-drift-smoke-gate-doctor-extensions
    provides: Production-parser fixture replay and the existing named CI drift-smoke invocation
provides:
  - Strict source-derived OpenCode 1.14.25 multi-step JSONL parser with bounded closed drift behavior
  - Provider-neutral protocol-drift error, reason vocabularies, framing bounds, and exact-own-data helpers
  - Sanitized three-step schema-derived OpenCode fixture with honestly pending live provenance
  - Immutable Claude/OpenCode adapter-native fixture table executed by the existing Phase 62 CI command
affects: [64-02, 64-05, 64-08, 64-10, 65-codex-adapter]

tech-stack:
  added: []
  patterns:
    - Hold non-continuation step finishes as one result candidate and accept only EOF afterward
    - Keep fixture/parser readiness independent from production registry and compatibility exposure
    - Project fixed normalized payloads while retaining provider metadata, tool bodies, and errors below the parser boundary

key-files:
  created:
    - mcp/src/agent-providers/protocol-drift.ts
    - mcp/src/agent-providers/opencode-stream.ts
    - tests/mcp-opencode-adapter.test.js
    - tests/fixtures/agent-streams/opencode-1.14.25/manifest.json
    - tests/fixtures/agent-streams/opencode-1.14.25/contract-stream.jsonl
  modified:
    - mcp/src/agent-providers/adapter.ts
    - mcp/src/agent-providers/claude-stream.ts
    - tests/mcp-agent-stream-fixture.test.js
    - tests/mcp-agent-drift-smoke.test.js

key-decisions:
  - "Treat only `tool-calls` and `unknown` as continuation finishes; retain the first other bounded source-valid reason as the sole candidate and emit it only at EOF."
  - "Add `opencode` to the shared provider-id and drift contracts now, while keeping the production registry and compatibility matrix Claude-only until Plan 05."
  - "Normalize tool records to fixed call id, tool name, and error status fields; provider input, output, metadata, and error bodies never cross the parser boundary."

patterns-established:
  - "Provider-native fixture contract: each provider owns its selectors, required fields, native order, normalized order, provenance rule, terminal rule, and negative mutators."
  - "Bounded drift detail: one shared error class exposes only canonical provider, closed reason, clamped event index, and allowlisted bounded issue paths."
  - "OpenCode step machine: one immutable session, unique step/message/part/call identities, explicit active-step transitions, bounded counters, and one held terminal candidate."

requirements-completed: [MULTI-03]

duration: 30 min
completed: 2026-07-20
---

# Phase 64 Plan 01: OpenCode Parser and First-Commit Drift Gate Summary

**A strict three-step OpenCode 1.14.25 parser, honest schema-derived fixture, shared bounded drift contract, and two-parser CI gate now precede every OpenCode production registration or topology change.**

## Performance

- **Duration:** 30 min
- **Started:** 2026-07-20T18:25:48Z
- **Completed:** 2026-07-20T18:56:06Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Extracted Claude's protocol failure/framing/event mechanics into a provider-neutral module with immutable per-provider reason vocabularies; all existing Claude normalization and drift labels remain green.
- Added a strict OpenCode 1.14.25 state machine for fatal UTF-8/JSON framing, exact source shapes, one session, unique identities, ordered multi-step continuation, bounded usage, sanitized provider failure, and one EOF-held result candidate.
- Added a deterministic sanitized three-step fixture whose native stream covers reasoning, text, completed/error tools, both continuation reasons, and a final `stop` candidate while retaining `schema-derived-contract`, `human_needed`, and `liveCapturePending: true` truth.
- Generalized the existing Phase 62 drift smoke into an immutable two-provider native contract while explicitly proving that production registry and compatibility exposure remain Claude-only.
- Added comprehensive negative coverage for malformed bytes/JSON/shapes, line/stream overflow, lifecycle/session/id/call/counter drift, provider error, continuation EOF, duplicate terminal, and data after candidate, with zero result on every failure.

## Task Commits

Each task was committed atomically:

1. **Task 64-01-01: Land the complete first-commit OpenCode parser, fixture, and CI drift gate** — `6bbf6727` (feat)

## Files Created/Modified

- `mcp/src/agent-providers/protocol-drift.ts` — Shared closed reasons, bounded diagnostics, exact-own-data helpers, JSONL decode/line limits, and immutable normalized events.
- `mcp/src/agent-providers/opencode-stream.ts` — Source-derived OpenCode schemas, bounded JSON validation, multi-step transition machine, sanitized normalization, and held terminal candidate.
- `mcp/src/agent-providers/adapter.ts` — Adds canonical `opencode` only to the shared closed provider-id type.
- `mcp/src/agent-providers/claude-stream.ts` — Consumes and re-exports the shared drift/framing/event mechanics without changing normalized behavior or reasons.
- `tests/fixtures/agent-streams/opencode-1.14.25/manifest.json` — Exact sanitized schema-derived provenance and pending genuine-capture task.
- `tests/fixtures/agent-streams/opencode-1.14.25/contract-stream.jsonl` — Eleven native records across three model steps and two tool continuations.
- `tests/mcp-opencode-adapter.test.js` — Positive, byte-split, immutability, provenance, confidentiality, strict-shape, bound, order, identity, error, and terminal tests.
- `tests/mcp-agent-stream-fixture.test.js` — Claude regression plus shared drift-class/reason-roster assertions.
- `tests/mcp-agent-drift-smoke.test.js` — Closed Claude/OpenCode native fixture table and the pre-registration registry/matrix boundary.

## Decisions Made

- Kept only `tool-calls` and `unknown` as continuation reasons because those are the two exact values consumed by the pinned 1.14.25 prompt loop; every other bounded source-valid finish is a candidate rather than immediate process success.
- Kept OpenCode out of `createProductionAdapterRegistry` and `ADAPTER_COMPATIBILITY_MATRIX`; parser and fixture drift are CI-blocking before Plan 05 is authorized to expose the provider.
- Projected tool events to call id/name/error status and provider failures to a fixed diagnostic code, preventing input, output, metadata, and raw error bodies from entering normalized diagnostics.
- Retained the existing single `Phase 62 adapter drift smoke` CI entry instead of adding another workflow command; its generalized harness now executes both production parser modules.

## TDD Evidence

- **RED:** the exact plan command built the existing MCP tree and failed on the deliberately absent `mcp/build/agent-providers/opencode-stream.js` production module.
- **GREEN:** the same workspace-preserving command passed the OpenCode first-commit gate, the complete Claude fixture regression, and the generalized Claude/OpenCode drift smoke.
- The final focused regression wrapper also passed agent-provider contract, adapter compatibility, reverse-channel contract, and spawn-supervisor suites.

## Security and Privacy

- The parser imports no child-process, network, account, credential, environment, browser, or logging authority; it consumes only an async byte stream.
- Every raw line is fatal UTF-8 decoded, JSON parsed, strict-schema checked, capped at 256 KiB, and counted inside a 2 MiB stream boundary.
- IDs, names, timestamps, times, costs, token/cache counters, JSON depth/nodes/keys/arrays, steps, tools, and event totals are bounded; duplicate or mixed identity fails closed.
- Raw tool input/output/error/metadata and provider error data are validated but never emitted. Drift messages contain only canonical provider/reason/index and allowlisted bounded paths.
- Fixture values are synthetic and contain no real prompt, browser content, credential, filesystem path, email, URL, card number, or account evidence.

## Deviations from Plan

None - the single task, nine declared files, RED/GREEN contract, production boundary, and atomicity were executed exactly as planned.

## Issues Encountered

- TypeScript's current Node buffer generics required an explicit `Buffer` annotation for the incremental pending-line accumulator; the source remained behaviorally identical after annotation.
- The Claude registry adapter intentionally wraps `parseClaudeEvents` instead of exposing the same function identity; the generalized smoke verifies the registered wrapper and the compiled production module without assuming identity.

## Known Pending Evidence

- No live OpenCode CLI, authenticated account/model, browser, network, server, or credential was used. A genuine sanitized OpenCode 1.14.25 stream comparison remains `human_needed` at the user-directed milestone-end UAT gate.
- Result authority still requires later supervisor clean-exit and process-tree corroboration; this plan supplies only the strict held candidate required before those topology changes.

## User Setup Required

None - all evidence is deterministic and offline.

## Verification

- `node scripts/run-mcp-build-preserving-workspace.mjs --commands-json '[["node","tests/mcp-opencode-adapter.test.js","--section","first-commit-drift-gate"],["node","tests/mcp-agent-stream-fixture.test.js"],["node","tests/mcp-agent-drift-smoke.test.js"]]'` — PASS.
- Workspace-preserving focused regressions for `mcp-agent-provider-contract`, `mcp-adapter-compatibility`, `mcp-reverse-channel-contract`, and `mcp-spawn-supervisor` — PASS.
- MCP prebuild source boundary, TypeScript build, compiled native-host boundary, forbidden-surface scans, stub scan, and `git diff --check` — PASS.
- Protected unrelated hashes remain byte-identical: `mcp/build/index.js` `6a492a2e...`, `llms-full.txt` `664347e0...`, `llms.txt` `c69ed23d...`, and `sitemap.xml` `826aa8f8...`.

## Next Phase Readiness

- Plan 64-02 can consume the provider-neutral drift module and closed `opencode` identity while generalizing declarative topology and supervisor types.
- Plans 64-05 and 64-08 can register the already-green parser and later corroborate its candidate only after clean child exit/tree settlement.
- No autonomous implementation blocker remains; genuine provider/browser evidence stays honestly deferred.

## Self-Check: PASSED

- All nine declared implementation/test/fixture artifacts and this summary exist.
- Task commit `6bbf6727` is present immediately after Phase 64 planning commit `7f25bb02` and contains no deletion or unrelated file.
- The exact plan verification, four focused regressions, workspace hashes, registry/matrix boundary, and clean staged-index checks pass.

---
*Phase: 64-opencode-adapter*
*Completed: 2026-07-20*
