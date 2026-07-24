---
phase: 60-adapter-contract-claude-code-mvp
verified: "2026-07-14T19:28:28Z"
status: human_needed
automated_status: passed
score: "15/15 declared truths verified"
requirements_score: "9/9 requirements satisfied"
artifacts_score: "16/16 declared artifacts verified"
key_links_score: "13/13 declared key links verified"
overrides_applied: 0
human_verification:
  - test: "Authenticated Claude Code 2.1.177 isolation profile"
    expected: "The retained native binary uses the closed MCP-only profile without provider API-key fallback, built-in tools, plugins, hooks, or session persistence."
    why_human: "Requires an installed and authenticated Claude Code 2.1.177 CLI."
  - test: "Genuine sanitized JSONL capture and contract corroboration"
    expected: "A reviewer-approved sanitized live capture corroborates the schema-derived fixture or records protocol drift."
    why_human: "Requires a genuine authenticated CLI run; the committed fixture truthfully remains schema-derived."
  - test: "Live CLI-to-loopback-MCP registration and tool call"
    expected: "The private FSB MCP configuration completes one harmless browser read with ordered events and exactly one terminal result."
    why_human: "Requires a paired extension, live daemon, authenticated CLI, and owned browser tab."
  - test: "POSIX descendant-tree termination"
    expected: "The exact process group and descendants terminate before settlement while an unrelated Claude process survives."
    why_human: "Requires observation of real macOS or Linux process-group behavior."
  - test: "Windows descendant-tree termination"
    expected: "A strongly confirmed tree terminates through fixed shell-free taskkill arguments; ambiguous evidence fails closed."
    why_human: "Requires a Windows host and native process inspection."
  - test: "Crash/restart orphan recovery without collateral kill"
    expected: "Recovery runs before capability advertisement, removes only a confirmed journaled tree, and preserves unrelated processes."
    why_human: "Requires forcefully crashing and restarting a live daemon with controlled processes."
  - test: "Browser ownership, vault references, and irreversible-action handoff"
    expected: "Ownership remains scoped, vault values stay undisclosed, and consent-required work stops before execution."
    why_human: "Requires a paired live browser, controlled vault references, and user observation."
---

# Phase 60: Adapter Contract & Claude Code MVP Verification Report

**Phase goal:** Deliver a shell-free, tree-killable Claude Code delegation core behind the authenticated serve-only reverse channel, with a closed provider contract, private runtime state, bounded event normalization, and crash-safe cleanup.

**Verified:** 2026-07-14T19:28:28Z
**Status:** `human_needed`
**Automated status:** `passed`

## Verdict

Phase 60 is automated/source green. ADAPT-01 through ADAPT-05 and CLAUDE-01 through CLAUDE-04 are satisfied, all 15 declared truths and 16 artifact declarations are implemented and wired, the final deep review is clean with zero findings, and the post-fix root suite exits `0` while preserving the dirty workspace exactly.

The overall verifier status remains `human_needed` solely because the seven authenticated CLI, real operating-system, and live-browser checks in `60-HUMAN-UAT.md` are pending. The user explicitly deferred every live UAT to the milestone-end sweep. No live result is inferred or marked passed.

## Goal Achievement

| # | Observable outcome | Status | Evidence |
|---|---|---|---|
| 1 | The provider-neutral boundary exposes exactly five methods and no lifecycle escape hatch. | VERIFIED | `adapter.ts`, closed registry tests, and the forbidden-flag prebuild gate pass. |
| 2 | Claude detection retains one safe native path and binds it to the closed 2.1.177 profile. | VERIFIED | Detection/profile and adapter suites cover version, path, unsafe shim, immutable argv, and unavailable cases. |
| 3 | Task text reaches the child only through bounded stdin; command, argv, environment, and working state are daemon controlled. | VERIFIED | Spawn capture, hostile payload, environment scrub, backpressure, EOF, and cancellation regressions pass. |
| 4 | Claude JSONL is incrementally bounded, strictly normalized, and fails loud on drift without fabricated success. | VERIFIED | Fixture, chunk-split, UTF-8, ordering, bounds, attestation, and mutation cases pass. |
| 5 | Runtime MCP configuration and orphan state are exact, private, atomic, symlink-safe, and secret-free. | VERIFIED | Permissions, exact-schema, canary, atomic-write, and failure-path tests pass. |
| 6 | POSIX and Windows termination paths are shell-free, tree-scoped, verified before settlement, and fail closed on ambiguity. | VERIFIED | Injected process-tree matrix and settled-operation lifetime regressions pass. |
| 7 | Serve startup binds HTTP, completes recovery, then advertises spawn authority; stdio never owns a supervisor. | VERIFIED | Serve-delegation and topology tests confirm ordered startup, one-way degradation, and orderly shutdown. |
| 8 | Start, progress, cancellation, topology loss, cleanup, and shutdown settle exactly once without replay. | VERIFIED | Supervisor, reverse-channel, and 254/254 topology cases cover held setup, held cleanup, route loss, and duplicate races. |
| 9 | The complete repository remains compatible and the test harness preserves pre-existing workspace state. | VERIFIED | `node scripts/run-phase60-full-tests.mjs` passes and reports workspace preservation; the temporary Phase 39 link is absent afterward. |

## Requirements Coverage

| Requirement | Status | Independent evidence |
|---|---|---|
| ADAPT-01 | SATISFIED | Exact interface shape and normalized types are pinned by the provider-contract suite. |
| ADAPT-02 | SATISFIED | Serve-only supervisor performs closed registry lookup, strict payload validation, fixed spawn options, and provider-key scrubbing. |
| ADAPT-03 | SATISFIED | No shell path exists; user text is absent from argv and is joined through stdin settlement. |
| ADAPT-04 | SATISFIED | Injected POSIX group and fixed native Windows tree termination block until child close and verified absence. |
| ADAPT-05 | SATISFIED | Exact journal identities drive recovery before capability advertisement; stale, ambiguous, and unrelated cases fail safely. |
| CLAUDE-01 | SATISFIED | The immutable 2.1.177 profile uses the shipped FSB agent, strict private MCP config, closed tools, turn cap, and no persistence. |
| CLAUDE-02 | SATISFIED | Prompt canaries remain absent from argv, environment, journal, diagnostics, and runtime paths. |
| CLAUDE-03 | SATISFIED (automated contract) | Strict parser and schema-derived fixture cover the normalized contract and drift behavior; genuine recorded provenance remains explicitly `human_needed`. |
| CLAUDE-04 | SATISFIED | Shell-free version probing and retained-path validation fail closed for missing, old, changed, or unsafe candidates. |

## Artifact and Wiring Audit

Plans 01-04 declare 16 artifacts and 13 key links. Every artifact exists, contains substantive implementation or regression evidence, and is connected through the expected call chain:

- Contract, registry, detection, closed profile, and shipped agent policy feed the concrete Claude adapter.
- The adapter's provider-specific JSONL parser emits only strict provider-neutral events.
- Private runtime files and process inspection feed the supervisor's prepare, activate, terminate, recover, and cleanup lifecycle.
- `runHttpMode` delegates ordered serve startup and shutdown; the bridge keeps one authenticated correlation open through progress and terminal settlement.
- Root test wiring runs the permanent forbidden-flag scan, Phase 60 focused gates, full compatibility suite, and workspace-preserving harness.

No declared artifact is missing, hollow, or orphaned. All 13 key links were verified from source and passing integration tests.

## Review Closure

The deep review found seven issues across three repair rounds: one critical degradation-authority gap, five lifecycle/harness warnings, and one low-severity settled-operation retention issue. Commits `18790740`, `1c7c69d5`, `ceca6048`, `0ee1c54b`, `3f594593`, `feb293ac`, and `adf31457` repair them with deterministic regressions.

Current `60-REVIEW.md` is `status: clean` with zero findings. It confirms fail-closed degradation, setup and stdin ownership, route-lifetime cancellation, final-cleanup precedence, workspace fingerprints, and bounded process-tree operation caching.

## Automated Verification

- TypeScript no-emit check passed.
- Provider contract, Claude adapter, stream fixture, orphan/process-tree, inventory, supervisor, reverse-channel, and harness suites passed.
- Bridge topology passed 254/254.
- The exact five Phase 59 transport errors and legacy serialization/version parity remain unchanged.
- `node scripts/run-phase60-full-tests.mjs` passed the full root suite and confirmed the workspace state was preserved.
- The temporary Phase 39 compatibility symlink was absent and the Git index was empty after the run.

## Human Verification Required

Exactly seven checks remain pending in `60-HUMAN-UAT.md`: authenticated isolation, genuine sanitized stream provenance, a live CLI/MCP browser read, POSIX tree termination, Windows tree termination, crash/restart recovery, and browser ownership/vault/consent behavior. Each remains `Result: pending`, deferred to milestone end by the user.

## Gaps Summary

There is no automated, source, artifact, wiring, regression, review, or workspace-integrity gap blocking Phase 60. The only outstanding evidence is the explicitly deferred live UAT. Therefore the correct status is `human_needed` with `automated_status: passed`, and Phase 61 may begin autonomously.

---

_Verified: 2026-07-14T19:28:28Z_
_Verifier: Codex autonomous verification_
