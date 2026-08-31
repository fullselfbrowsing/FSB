---
phase: 59-reverse-request-channel-security-foundation
plan: "01"
subsystem: security
tags: [mcp, reverse-channel, validation, redaction, prebuild-gate]

requires: []
provides:
  - Separate additive ext request, response, and event contracts with strict runtime validation
  - Caller-level and diagnostic-sink bridge credential redaction
  - Recursive forbidden agent-provider flag gate before every MCP build
affects: [59-02, 59-03, 59-04, 60-adapter-contract-claude-code-mvp]

tech-stack:
  added: []
  patterns:
    - Separate reverse-frame union outside frozen MCPMessageType
    - Bounded defense-in-depth string sanitization at the diagnostic sink
    - External recursive source gate with no in-tree adapter exemptions

key-files:
  created:
    - mcp/src/ext-protocol.ts
    - tests/mcp-reverse-channel-contract.test.js
    - scripts/verify-agent-provider-flags.mjs
    - tests/agent-provider-forbidden-flags.test.js
  modified:
    - mcp/src/types.ts
    - extension/utils/redactForLog.js
    - extension/utils/diagnostics-ring-buffer.js
    - tests/redact-for-log.test.js
    - tests/diagnostics-ring-buffer.test.js
    - mcp/package.json
    - package.json

key-decisions:
  - "Keep ext frames entirely separate from MCPMessageType and preserve default relay serialization by omitting absent capabilities."
  - "Sanitize bridge credentials at the caller and again with bounded traversal at the diagnostic sink, including a load-order-safe private fallback."
  - "Place forbidden flag literals in an external recursive prebuild scanner with no ignore syntax, extension filter, or adapter-directory exemption."

patterns-established:
  - "Reverse frame validation: accept only bounded plain records, exact frame fields, closed error codes, and exactly one response outcome."
  - "Secret defense in depth: shared exact token scrubber at callers plus identical fallback sanitization before memory and storage writes."
  - "Future adapter gate: every regular or symlink-resolved file under mcp/src/agent-providers is scanned before TypeScript compiles."

requirements-completed: [CHAN-01, CHAN-05, CHAN-07]

duration: 15 min
completed: 2026-07-13
---

# Phase 59 Plan 01: Reverse-Request Channel Security Foundation Summary

**Strict additive ext-frame validation, two-layer bridge-secret redaction, and a permanent recursive prebuild gate landed without changing legacy MCP or relay bytes.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-13T02:26:18Z
- **Completed:** 2026-07-13T02:40:46Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added separate `ExtRequest`, `ExtResponse`, and `ExtEvent` types plus strict runtime constructors/validators while the unchanged version-parity test kept every historical MCP/tool/envelope contract frozen.
- Removed exact FSB bridge credential tokens from Error messages and from bounded diagnostic fields before both in-memory and persistent storage writes, including when the shared redactor has not loaded yet.
- Added a deterministic recursive scanner that rejects all three CHAN-07 flags in every adapter file type and runs automatically before each MCP build.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the separate ext contract and byte-freeze fixtures** - `69094651` (feat)
2. **Task 2: Enforce caller-level and sink-level bridge-secret redaction** - `5037814f` (fix)
3. **Task 3: Add the permanent forbidden-agent-flag prebuild gate** - `4ecafcd0` (chore)

## Files Created/Modified

- `mcp/src/ext-protocol.ts` - Closed error vocabulary, stable frame limits, strict parser, and exact error response constructor.
- `mcp/src/types.ts` - Separate ext family and optional relay capability type without changing `MCPMessageType` or `MCPResponse`.
- `tests/mcp-reverse-channel-contract.test.js` - Valid/malformed/control-field coverage plus exact legacy relay JSON freezes.
- `extension/utils/redactForLog.js` - Shared bridge-secret scrubber on global and CommonJS surfaces, including Error/caller paths.
- `extension/utils/diagnostics-ring-buffer.js` - Depth/key/array-bounded sink sanitizer with load-order-safe fallback.
- `tests/redact-for-log.test.js` - Header, query, Error, and nested bridge-secret fixtures.
- `tests/diagnostics-ring-buffer.test.js` - In-memory/storage absence proof plus sanitizer bound checks.
- `scripts/verify-agent-provider-flags.mjs` - Recursive, deterministic, fail-closed adapter source scanner.
- `tests/agent-provider-forbidden-flags.test.js` - Missing/clean/positive/symlink/read-error scanner fixtures.
- `mcp/package.json` - Scanner wired as `prebuild` before the existing build body.
- `package.json` - Scanner and reverse-channel contract tests added once in the required serial positions.

## Decisions Made

- Reject unknown ext-frame top-level keys and ambiguous response outcomes rather than normalizing them, keeping malformed/control-plane input fail-closed.
- Cap payload records at 100 keys and export the limit with the string/error limits so later routing layers share one stable contract.
- Follow symlinked regular files and directories while tracking resolved directories to prevent cycles; broken symlinks and read failures fail the gate.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Verification

- `npm --prefix mcp run build` - PASS; scanner ran in `prebuild` before `tsc`.
- `node tests/mcp-version-parity.test.js && node tests/mcp-reverse-channel-contract.test.js` - PASS; 16 historical parity assertions plus all reverse-frame/relay freezes passed.
- `node tests/redact-for-log.test.js && node tests/diagnostics-ring-buffer.test.js && node tests/audit-log-no-secret.test.js` - PASS; full and 16-character credential substrings absent.
- `node tests/agent-provider-forbidden-flags.test.js` - PASS across missing, clean, 12 literal/file-type combinations, multiple matches, symlink, and fail-closed error fixtures.
- `npm test` with the temporary Phase 39 archive symlink under a shell trap - PASS (exit 0); the link is absent and unstaged afterward.
- `git diff --check` and prohibited-production-code audit - PASS; no child-process/spawn implementation or production capability advertisement was added.

## User Setup Required

None - no external service configuration required.

## Tracking Note

ROADMAP and STATE plan counters were intentionally left for the phase orchestrator. This repository's STATE file explicitly warns that the current GSD progress commands count collapsed archives and deleted historical phase trees, which can corrupt the active v0.9.91 milestone totals.

## Next Phase Readiness

- Ready for 59-02 to add pairing/auth state and the pre-upgrade trust boundary on top of the now-frozen contract and gates.
- No Plan 02+ authentication, routing, spawn, or UI behavior was implemented in this plan.

## Self-Check: PASSED

- All four created key files exist.
- All three task commits are present and scoped to explicit planned files.
- Every task acceptance criterion and plan-level verification command passed.
- The temporary Phase 39 fixture is absent, and unrelated user changes remain unstaged.

---
*Phase: 59-reverse-request-channel-security-foundation*
*Completed: 2026-07-13*
