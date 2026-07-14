---
phase: 60
slug: adapter-contract-claude-code-mvp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-14
---

# Phase 60 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Dependency-free Node assertions against compiled TypeScript, injected child/process/platform/filesystem fakes, and existing real `ws` bridge harnesses |
| **Config file** | `package.json`, `mcp/package.json`, `mcp/tsconfig.json` |
| **Quick run command** | `npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js && node tests/mcp-claude-code-adapter.test.js` |
| **Full suite command** | `npm test` with the temporary Phase 39 compatibility symlink and a cleanup trap |
| **Estimated runtime** | focused slices < 30 seconds; full root suite several minutes |

The workspace contains user-owned deletions of historical Phase 39 artifacts. For full-suite runs only, create an untracked symlink at `.planning/phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md` pointing to `.planning/milestones/v1.0.0-phases/39-breadth-c-commerce-travel-misc-most-sensitive/39-06-REMAINING-APPS.md`, install a shell trap that removes the link and empty directory, and never stage or commit it.

---

## Sampling Rate

- **After every task commit:** Run that task's focused command from the map below.
- **After every plan wave:** Run all Phase 60 focused tests accumulated through the wave.
- **Before phase verification/review:** Run the complete root `npm test` chain; the temporary Phase 39 link must be absent afterward.
- **Max feedback latency:** 30 seconds for a focused slice; one full-suite run at each wave boundary.
- **No-watch/no-retry rule:** Watch modes, flaky retries, live model calls, and automatically replayed tasks do not count as verification.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 60-01-01 | 01 | 1 | ADAPT-01, ADAPT-02 | T60-01 | Exact five-method contract and closed registry expose no spawn/lifecycle escape hatch | contract | `npm --prefix mcp run build && node tests/mcp-agent-provider-contract.test.js` | ❌ W0 | ⬜ pending |
| 60-01-02 | 01 | 1 | CLAUDE-01, CLAUDE-02, CLAUDE-04 | T60-01, T60-02, T60-03 | One retained binary/profile; fixed MCP-only argv; static agent; no shell, provider keys, task argv, or unsafe shim | unit/source gate | `npm --prefix mcp run build && node tests/mcp-claude-code-adapter.test.js && node tests/agent-provider-forbidden-flags.test.js` | ❌ W0 / ✅ gate | ⬜ pending |
| 60-01-03 | 01 | 1 | CLAUDE-02 | T60-02 | Published static persona states ownership/vault/consent rules and package includes it | contract | `node tests/mcp-agent-provider-contract.test.js && npm --prefix mcp pack --dry-run --json` | ❌ W0 | ⬜ pending |
| 60-02-01 | 02 | 2 | CLAUDE-03 | T60-04, T60-05 | Known provider events normalize to strict provider-neutral envelopes; raw Claude shapes do not escape | protocol | `npm --prefix mcp run build && node tests/mcp-agent-stream-fixture.test.js` | ❌ W0 | ⬜ pending |
| 60-02-02 | 02 | 2 | CLAUDE-03 | T60-04, T60-05 | Unknown/malformed/oversize/chunked/final-line cases fail loud or normalize exactly, drain >200 KiB, and never fabricate success | mutation/resource | `node tests/mcp-agent-stream-fixture.test.js` | ❌ W0 | ⬜ pending |
| 60-03-01 | 03 | 2 | ADAPT-05 | T60-06, T60-07 | Owner-only atomic journal/config reject symlinks and persist no prompt/provider output | filesystem unit | `npm --prefix mcp run build && node tests/mcp-agent-orphan-recovery.test.js` | ❌ W0 | ⬜ pending |
| 60-03-02 | 03 | 2 | ADAPT-04 | T60-06 | POSIX group and Windows direct taskkill ordering wait for verified tree absence | lifecycle unit | `node tests/mcp-spawn-supervisor.test.js && node tests/mcp-agent-orphan-recovery.test.js` | ❌ W0 | ⬜ pending |
| 60-03-03 | 03 | 2 | ADAPT-04, ADAPT-05 | T60-06, T60-07 | Recovery kills only confirmed journaled survivors; stale clears; ambiguity withholds spawn; unrelated process survives | recovery matrix | `node tests/mcp-agent-orphan-recovery.test.js` | ❌ W0 | ⬜ pending |
| 60-04-01 | 04 | 3 | ADAPT-02, ADAPT-03 | T60-01, T60-03, T60-05 | Strict start/cancel payloads, fixed spawn options, stdin-only task, scrubbed env, concurrent drains, and exact-once settlement | supervisor integration | `npm --prefix mcp run build && node tests/mcp-spawn-supervisor.test.js` | ❌ W0 | ⬜ pending |
| 60-04-02 | 04 | 3 | ADAPT-02, ADAPT-05 | T60-07, T60-08 | Only `serve` advertises after recovery; delegation id emits early; events flow until one terminal response; cancel cannot forge identity | bridge integration | `node tests/mcp-reverse-channel-contract.test.js && node tests/mcp-bridge-topology.test.js` | ✅ extend | ⬜ pending |
| 60-04-03 | 04 | 3 | ADAPT-01–05, CLAUDE-01–04 | T60-01–T60-09 | Async shutdown settles every run; exact-five transport errors and frozen legacy bytes remain unchanged; full suite is green | system/regression | `node tests/mcp-version-parity.test.js && node tests/agent-provider-forbidden-flags.test.js && npm test` | ✅ extend/full | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/mcp-agent-provider-contract.test.js` — exact interface/registry/capability/static-agent/package assertions.
- [ ] `tests/mcp-claude-code-adapter.test.js` — retained detection, minimum/profile, argv/config/stdin/env, unsafe Windows shim, and init-attestation fixtures.
- [ ] `tests/mcp-agent-stream-fixture.test.js` — sanitized baseline, deterministic mutations, bounds, and terminal drift behavior.
- [ ] `tests/mcp-spawn-supervisor.test.js` — injected child/stream/clock/process races and exact-once terminal settlement.
- [ ] `tests/mcp-agent-orphan-recovery.test.js` — owner-only journal plus confirmed/stale/ambiguous/unrelated process matrix.
- [ ] Extend `tests/mcp-reverse-channel-contract.test.js` and `tests/mcp-bridge-topology.test.js` for strict `delegate.*`, early delegation id, serve-only capability, recovery order, and shutdown.
- [ ] Add the focused test commands once to root `package.json` without dropping/reordering existing commands unnecessarily.

No test framework, AI framework, Python service, LLM judge, or hosted collector is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude Code 2.1.177 subscription/keychain auth plus effective empty setting-source/tool/MCP isolation | CLAUDE-01, CLAUDE-02, CLAUDE-04 | Requires the user's authenticated installed CLI; current docs do not prove every baseline-version interaction | At milestone end, run the fixed profile with a benign task and inspect init: only FSB MCP, no built-ins/plugins/hooks, correct retained path/version, and no API-key fallback |
| Real sanitized 2.1.177 JSONL capture agrees with the pinned contract fixture | CLAUDE-03 | Requires a live model invocation and honest provenance | Capture one benign stream at milestone end, sanitize it, compare required type/subtype/field sequence, and record drift without silently updating the parser |
| POSIX and Windows descendant termination | ADAPT-04 | Kernel/process-tree semantics cannot be established by injected fakes alone | On each OS at milestone end, spawn a controlled descendant tree, cancel, verify TERM/grace/KILL or taskkill behavior and zero matching descendants |
| Daemon-crash orphan recovery without collateral kill | ADAPT-05 | Requires cross-process crash/restart and real process identity inspection | Crash `serve` during a controlled run, restart, confirm only the journaled verified tree ends before capability advertisement, and confirm an unrelated Claude process remains |
| Claude -> loopback MCP -> browser ownership/vault/irreversible-action behavior | CLAUDE-02, ADAPT-02 | Requires authenticated CLI, unpacked Chrome, and real browser state | At the final gate, run benign and consent-requiring tasks; confirm FSB agent identity/tab ownership, vault-reference use, and human handoff before irreversible action |

All manual checks remain `human_needed` and deferred to the single milestone-end UAT gate. Automated/source verification remains blocking now.

---

## Security Blocking Matrix

| Threat | Severity | Blocking automated evidence |
|--------|----------|-----------------------------|
| T60-01 control-plane/shell injection | Critical | recursively strict payload schemas, fixed argv, stdin canary, no-shell scanner |
| T60-02 inherited tools/settings or auto-approval | Critical | exact profile/static policy, MCP-only config, init-attestation drift tests, forbidden-flag gate |
| T60-03 binary/auth/secret confusion | High | retained exact path/version, unsafe-shim rejection, provider-key scrub and leakage canaries |
| T60-04 provider protocol drift/fabricated success | High | pinned fixture, missing/unknown mutations, typed drift, zero success/replay |
| T60-05 pipe/resource deadlock | High | concurrent stream fakes, backpressure, 64/256 KiB bounds, >200 KiB drain |
| T60-06 incomplete tree termination | Critical | POSIX/Windows state matrices and cancel-after-tree-absence contract |
| T60-07 orphan/collateral process handling | Critical | atomic journal, strong identity matrix, ambiguity fail-closed, unrelated untouched |
| T60-08 confused-deputy/topology replay | High | Phase 59 authenticated route, serve-only capability, exact-once local/relay harness |
| T60-09 legacy wire/package regression | High | exact-five errors, byte/version parity, package/static asset assertions, full root suite |

No Critical/High automated threat evidence may be deferred. Only the real-environment corroboration listed above is deferred.

---

## Validation Sign-Off

- [ ] All tasks have an automated verify command or explicit Wave 0 dependency.
- [ ] Sampling continuity: no three consecutive tasks without automated verification.
- [ ] Wave 0 covers every missing focused fixture.
- [ ] Existing Phase 59 auth/topology/parity and forbidden-flag gates remain green.
- [ ] Full root suite runs with the temporary historical fixture and removes it afterward.
- [ ] Manual checks are preserved as milestone-end `human_needed`, never fabricated.
- [ ] No production extension/side-panel Phase 61 behavior enters the Phase 60 plans.
- [ ] `nyquist_compliant: true` is set after plan-checker approval.

**Approval:** pending

