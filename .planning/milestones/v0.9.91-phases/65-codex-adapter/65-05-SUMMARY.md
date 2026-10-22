---
phase: 65-codex-adapter
plan: "05"
subsystem: native-agent-adapter
tags: [codex, agent-provider, jsonl-parser, auth-isolation, compatibility, protocol-drift]

requires:
  - phase: 65-codex-adapter
    plan: "04"
    provides: Sanitized byte probes, effective-authority attestation, and direct-runtime cleanup authority
provides:
  - Complete frozen five-method Codex task adapter with exact 0.142.5 profile
  - Byte-only four-state Codex auth detection and immediate consent-bound identity re-probe
  - Strict bounded Codex JSONL normalizer with schema-derived fixture and executable native negatives
  - Exact third production registry, compatibility, diagnostics, inventory, recovery, and drift coverage
affects: [65-06, 65-07, 65-08, provider-ui, delegation-authority, phase62-drift]

tech-stack:
  added: []
  patterns:
    - Expose a native provider only in one atomic source, fixture, registry, compatibility, and test boundary
    - Classify secret-bearing native status from bounded Buffers and zeroize every owned result
    - Hold the normalized success candidate until exit, tree, journal, and empty-scratch cleanup all settle

key-files:
  created:
    - mcp/src/agent-providers/codex.ts
    - mcp/src/agent-providers/codex-detect.ts
    - mcp/src/agent-providers/codex-profile.ts
    - mcp/src/agent-providers/codex-stream.ts
    - tests/fixtures/agent-streams/codex-0.142.5/manifest.json
    - tests/fixtures/agent-streams/codex-0.142.5/contract-stream.jsonl
    - tests/fixtures/agent-streams/codex-0.142.5/expected-events.json
    - tests/fixtures/agent-streams/codex-0.142.5/native-negative-corpus.json
  modified:
    - mcp/src/agent-providers/registry.ts
    - mcp/src/agent-providers/compatibility.ts
    - mcp/src/agent-providers/effective-authority.ts
    - mcp/src/agent-providers/spawn-supervisor.ts
    - mcp/src/client-inventory.ts
    - mcp/src/diagnostics.ts
    - tests/delegation-phase-contract.test.js

key-decisions:
  - "Pin the executable profile and schema-derived fixture to Codex 0.142.5; classify exact 0.142.5 Supported and newer compatible 0.x versions, including installed 0.144.6, Degraded."
  - "Permit only stdin task mode, a read-only sandbox, closed native configuration, and exactly the required local fsb MCP server with search_capabilities and invoke_capability."
  - "Publish only chatgpt, api_key, unauthenticated, or unknown and derive billing only in the accepted five-field identity boundary."
  - "Treat genuine stream provenance as pending until milestone-end human UAT; checked-in evidence remains schema-derived-contract with liveCapturePending true."

patterns-established:
  - "Atomic provider exposure: adapter, detector, profile, parser, native negatives, rosters, diagnostics, and sentinels land in one implementation commit."
  - "Synthetic detector seam: test configuration cannot fall through to a real provider process when a detector dependency is omitted."

requirements-completed: [MULTI-04, MULTI-05, MULTI-06]

duration: 1h 4m
completed: 2026-07-22
---

# Phase 65 Plan 05: Atomic Codex Adapter Exposure Summary

**Codex is now the complete third native task provider: a closed 0.142.5 stdin profile, byte-safe auth and authority proofs, strict JSONL normalization, honest schema-derived fixtures, and exact registry/diagnostic/drift coverage landed in one production commit.**

## Performance

- **Duration:** 1h 4m
- **Started:** 2026-07-22T12:18:15Z
- **Completed:** 2026-07-22T13:22:07Z
- **Tasks:** 1
- **Files modified:** 32

## Accomplishments

- Added the frozen five-method Codex adapter, retained native-binary/version detector, exact task-only spawn profile, and strict fatal-UTF8 bounded JSONL parser.
- Added four-state auth classification from bounded byte buffers, exact ChatGPT/API billing projection, sanitized environment policy, immediate identity re-probe, and exact effective FSB MCP authority attestation.
- Added a sanitized 0.142.5 schema-derived contract fixture and 43-case executable native-negative corpus covering lifecycle, MCP authority, schema, ordering, usage, encoding, and size/count/depth failures.
- Expanded the production roster, compatibility matrix, recovery, diagnostics, inventory, provider/version/fixture/drift bijections, forbidden-flag checks, and atomic-exposure sentinel together.
- Preserved task-only authority: no resume/chat/server mode, no native shell/file/web/collaboration tool, and no authoritative result before clean process/tree/journal/empty-scratch settlement.

## Task Commit

The single implementation task was committed atomically:

1. **Atomically expose the complete Codex 0.142.5 adapter, auth, parser, fixture, and drift contract** — `a9258cf1` (feat)

The commit contains exactly the 32 corrected Plan 05 implementation paths. Its parent contains no `CODEX_ADAPTER_ID`, `createCodexAdapter`, or `codex-0.142.5` production/fixture exposure, and `git log -S CODEX_ADAPTER_ID` identifies only `a9258cf1` as the first exposure.

## Files Created/Modified

- `mcp/src/agent-providers/codex.ts` — Frozen exact five-method task-only adapter.
- `mcp/src/agent-providers/codex-detect.ts` — Native identity/version resolution and bounded byte-only auth classification.
- `mcp/src/agent-providers/codex-profile.ts` — Exact stdin argv, closed configuration, auth probe, and FSB authority descriptor.
- `mcp/src/agent-providers/codex-stream.ts` — Strict JSONL state machine emitting only normalized safe events and one held result candidate.
- `mcp/src/agent-providers/adapter.ts`, `accepted-identity.ts`, `registry.ts`, and `compatibility.ts` — Closed third provider id, auth/billing identity, production registration, and Supported/Degraded authority.
- `mcp/src/agent-providers/spawn-environment.ts`, `effective-authority.ts`, and `spawn-supervisor.ts` — Codex credential/noise stripping, forced closed exec-server value, byte matcher, native authority classifier, and fresh identity equality barrier.
- `mcp/src/agent-providers/runtime-files.ts`, `serve-delegation.ts`, and `protocol-drift.ts` — Direct-only scratch lifecycle, bounded roster collection, and Codex-safe drift taxonomy.
- `mcp/src/client-inventory.ts` and `mcp/src/diagnostics.ts` — Safe synthetic-test seam and exact local-only Codex availability/auth/compatibility projection.
- `tests/fixtures/agent-streams/codex-0.142.5/` — Sanitized valid contract, expected normalized sequence, honest manifest, and 43 executable negatives.
- The 12 declared test files — Exact adapter, auth, environment, authority, recovery, supervisor, parser, fixture, roster, compatibility, diagnostics, inventory, version, forbidden-flag, and atomicity proof.

## Decisions Made

- Preserved `CODEX_HOME` only so Codex can use its own stored login while stripping explicit Codex/OpenAI credentials and all reviewed exec-server/noise variables; policy alone restores `CODEX_EXEC_SERVER_URL=none`.
- Accepted only exact 0.142.5 as Supported. Newer compatible versions remain runnable but Degraded and cannot become checked-in fixture provenance.
- Parsed API-key login status through a fixed byte shape containing a masked separator; neither detector nor supervisor stringifies or publishes raw status bytes.
- Configured exactly one required enabled `fsb` server with the two approved tools and server-local approval, while disabling the reviewed native tool-bearing feature roster and inherited shell environment.
- Kept reasoning and todo text non-persistent, rejected every unknown or authority-bearing native event, and emitted only sanitized FSB tool identities/results.

## Verification

- Exact 12-command preservation wrapper — **PASS** after TypeScript build plus source and compiled native-host boundary checks.
- `mcp-codex-adapter`, orphan recovery, complete spawn-supervisor, stream fixture, drift smoke, provider contract, compatibility, client inventory, and forbidden-flags suites — **PASS**.
- Native negative corpus — **43/43 cases exercised and rejected as specified**.
- Version/parity suite — **148 passed, 0 failed**.
- Diagnostics suite — **311 passed, 0 failed**.
- Atomic exposure sentinel — **8 passed, 0 failed**.
- Scoped staged `git diff --check` — **PASS**; index contained exactly 32 declared paths with no missing or extra file.
- Parent-commit exposure scan — **PASS**; no Codex production/fixture marker existed before `a9258cf1`.
- Fixture provenance remains `schema-derived-contract`, `recordedProvenanceStatus: human_needed`, and `liveCapturePending: true`.
- The inherited 402 planning deletions and four unrelated dirty artifacts stayed unstaged. Preservation hashes remained:
  - `mcp/build/index.js`: `6a492a2edf5607c1ece9bdc8e6f7e715cc3459dca0a77e7b839fdf42a8c205f4`
  - `showcase/angular/public/llms-full.txt`: `664347e0e6a30c276bdbdfea8bb2bfdf1242bd7d61fb6493de870fccd4ddd38e`
  - `showcase/angular/public/llms.txt`: `c69ed23d415f8f9f097ec386e789372a3a8a71b011b4d4420bf09ee949587e76`
  - `showcase/angular/public/sitemap.xml`: `826aa8f8b2bc828c423572a6b9697d0666a94a830b7aebbdf1812501e88c3bea`

## Deviations from Plan

### Contained native-probe deviation

- During an early client-inventory regression run, before every test-only provider detector had been made mandatory, the installed Codex 0.144.6 binary may have received one `--version` probe and one `login status` probe.
- No model/task call, login mutation, browser action, direct credential-store read, network task, or genuine stream capture occurred. The bounded auth result was reduced to the safe enum and zeroized.
- The run was stopped from recurring by making non-null test inventory configuration replace all unconfigured process-bearing dependencies with throwing test-only seams and by injecting synthetic `codexDetect` dependencies into every declared production-registry test construction. All subsequent focused and exact-matrix runs were synthetic-only.
- The installed 0.144.6 result was not recorded as fixture provenance; it remains only the planned Degraded compatibility class.

### Corrected atomic supervisor ownership

- The pre-implementation audit found that the complete supervisor regression still treated the new forced `CODEX_EXEC_SERVER_URL=none` value and a valid Codex identity as hostile legacy state.
- Plan/validation ownership was corrected in `4aac3c8e` before the implementation commit, making `tests/mcp-spawn-supervisor.test.js` the 32nd atomic path and the full supervisor suite the third exact command. The implementation updated both assertions in `a9258cf1` and the corrected matrix passed.

**Total deviations:** one contained native read-only probe incident and one pre-implementation ownership correction. Neither expanded runtime authority or fabricated provenance.

## Issues Encountered

- The first corrected 12-command matrix run exposed that the working atomic sentinel still listed the former 31-path boundary. The already-declared sentinel was updated with the supervisor test in exact plan order; the entire 12-command matrix was rerun and passed.
- No remaining Plan 05 blocker exists.

## User Setup Required

None - no login, account, credential, browser, or external service setup was performed or is required for this implementation boundary.

## Next Phase Readiness

- Plan 65-06 can project the safe third provider row and exact Codex auth/billing state through extension storage, consent, and background-owned selection.
- Plan 65-07 can consume the shared normalized feed and accepted identity without adding a Codex-specific controller or renderer.
- Genuine sanitized 0.142.5 stream and account-state evidence remains explicitly deferred to milestone-end human UAT; `liveCapturePending` must stay true until reviewed.

## Self-Check: PASSED

- One implementation commit first exposes every Codex source, fixture, registry, compatibility, recovery, diagnostics, and drift surface together.
- The exact corrected matrix passes with synthetic provider dependencies and no subsequent real Codex process probe.
- The implementation commit contains exactly 32 declared files; inherited deletions and dirty artifacts remain outside both commits.
- Checked-in provenance remains honest and pending.

---
*Phase: 65-codex-adapter*
*Completed: 2026-07-22*
