# Phase 60: Adapter Contract & Claude Code MVP - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `60-CONTEXT.md`; this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 60-adapter-contract-claude-code-mvp
**Mode:** Autonomous (`--auto`); recommended options selected under the user's instruction to continue without discussion pauses
**Areas discussed:** Phase boundary and production handoff, adapter and supervisor ownership, spawn and process lifecycle, Claude Code invocation compatibility, stream protocol and verification

---

## Phase Boundary and Production Handoff

| Option | Description | Selected |
|--------|-------------|----------|
| Daemon/adapter boundary | Ship the production daemon handler and verify through the authenticated reverse-channel harness; leave user-facing routing/lifecycle to Phase 61. | ✓ |
| Minimal side-panel branch now | Add a temporary start path and raw feedback before Phase 61 replaces it. | |
| Pull full UX forward | Implement consent, feed, persistence, stop UX, and offline behavior in Phase 60. | |

**User's choice:** Auto-selected recommended option: daemon/adapter boundary.
**Notes:** The normative requirement mapping assigns Phase 60 ADAPT/CLAUDE and Phase 61 UX/LIFE. This avoids duplicating lifecycle code while still wiring a real `serve` handler.

---

## Adapter and Supervisor Ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Thin adapters, policy supervisor | Adapters implement exactly five methods; the supervisor alone owns validated spawn/lifecycle policy. | ✓ |
| Self-spawning adapters | Each adapter creates and supervises its own process. | |
| Claude-specialized supervisor | Put Claude flags and parsing directly in one supervisor. | |

**User's choice:** Auto-selected recommended option: thin adapters with a policy-owning supervisor.
**Notes:** This preserves the exact ADAPT-01 contract and prevents later adapters from duplicating security-critical process policy.

---

## Spawn and Process Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Closed task methods + recovery journal | Exact `delegate.start`/`delegate.cancel` payloads, stdin-only prompts, long-lived correlation, deterministic tree kill, and verified journal-backed orphan cleanup. | ✓ |
| Generic spawn pass-through | Let the extension provide flags, argv, cwd, or environment. | |
| Detached short acknowledgement | Return immediately and stream later without request correlation. | |

**User's choice:** Auto-selected recommended option: closed task methods plus recovery journal.
**Notes:** Caller-controlled spawn fields are incompatible with ADAPT-02/03. Broad process-name killing is also rejected because it could terminate a user's unrelated Claude session.

---

## Claude Code Invocation Compatibility

| Option | Description | Selected |
|--------|-------------|----------|
| Pinned fail-closed profiles | Bind one resolved binary/version, run controlled profile spikes, use strict MCP and shipped policy, and reject unverified native/shim layouts. | ✓ |
| Latest-flags best effort | Emit the newest documented flags regardless of detected version. | |
| Embedded Claude Agent SDK | Replace the installed CLI with an SDK integration. | |

**User's choice:** Auto-selected recommended option: pinned fail-closed version profiles.
**Notes:** Local evidence confirms PATH resolves Claude Code 2.1.177 and most flags. Same-invocation agent selection, hidden `--max-turns`, empty-tool handling, stdin behavior, and Windows shim resolution remain explicit research spikes.

---

## Stream Protocol and Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Closed normalized parser | Bounded JSONL framing, provider-neutral events, recorded fixture, negative mutations, backpressure proof, and fail-loud drift diagnostics. | ✓ |
| Permissive pass-through | Forward unknown Claude events and let downstream code interpret them. | |
| UI parses raw events | Send Claude JSON directly to the side panel. | |

**User's choice:** Auto-selected recommended option: closed normalized parser.
**Notes:** Phase 61 must not inherit Claude-specific schemas. Unknown event types cannot be silently accepted because CLAUDE-03 makes drift detection a correctness gate.

## the agent's Discretion

- Exact internal module split and bounded size constants.
- Exact provider-neutral event type spelling, subject to the locked semantic coverage.
- Test injection helpers and secret-free diagnostic wording.

## Deferred Ideas

- All production delegation UX/lifecycle work remains Phase 61.
- Compatibility/doctor surfaces remain Phase 62; native wake remains Phase 63.
- OpenCode/Codex adapters remain Phases 64/65; chat mode is future work.
- All live UAT remains queued for the milestone-end gate.
