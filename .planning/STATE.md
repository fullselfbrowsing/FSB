---
gsd_state_version: 1.0
milestone: v0.9.91
milestone_name: MCP Clients as Providers
status: executing
stopped_at: Phase 62 planned and independently verified; ready for autonomous execution
last_updated: "2026-07-16T17:12:15.202Z"
last_activity: 2026-07-16 -- Phase 62 planning complete
progress:
  total_phases: 9
  completed_phases: 5
  total_plans: 28
  completed_plans: 22
  percent: 56
---

*Note: the `total_phases`/`completed_phases` counts above are scoped to the active v0.9.91 milestone (Phases 57-65) only. Some GSD tooling (`roadmap.analyze`, `phase.complete`) reports a noisy multi-phase count including collapsed `## Completed Milestones` archive entries and `## Backlog` sections — treat this file's own numbers as authoritative for v0.9.91 progress.*

# Project State

## Project Reference

See: .planning/PROJECT.md (v0.9.91 MCP Clients as Providers — Current Milestone section, Key context bullets)
See: .planning/ROADMAP.md (v0.9.91 active, Phases 57-65; v1.2.0 / v1.1.0 / v1.0.0 / v0.9.99 / etc. archived and collapsed)
See: .planning/REQUIREMENTS.md (51 v1 requirements across 9 categories: IDENT, PROV, CHAN, ADAPT, CLAUDE, UX, LIFE, DRIFT, NATIVE, MULTI — all mapped to Phases 57-65, 37/51 complete)
See: .planning/research/SUMMARY.md (converged research summary; suggested phase structure; HIGH confidence)
See: .planning/research/PITFALLS.md (16 pitfalls with phase assignments; security section verified against 2025-2026 CVE class incidents)
See: .planning/research/ARCHITECTURE.md (file:line integration seams; brownfield mapping onto existing FSB architecture)
See: .planning/milestones/v1.2.0-ROADMAP.md, .planning/milestones/v1.2.0-REQUIREMENTS.md, .planning/v1.2.0-MILESTONE-AUDIT.md (archived Showcase i18n Completeness milestone)

**Core value:** Reliable single-attempt execution — the AI decides correctly, the mechanics execute precisely. v0.9.91 does not touch the DOM/automation single-attempt property; it extends the surface so installed agent CLIs (Claude Code first, then OpenCode + Codex) become first-class side-panel providers that drive the same live browser through FSB's own MCP tools.
**Current focus:** Phase 62 — CI Drift-Smoke Gate & Doctor Extensions, planned and ready for autonomous execution

## Current Position

Phase: 62
Plan: Not started
Status: Ready to execute
Last activity: 2026-07-16 -- Phase 62 planning complete

## Roadmap At A Glance (v0.9.91, Phases 57-65)

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 57 | Agent Identity Capture | IDENT-01, IDENT-02, IDENT-03, IDENT-04, IDENT-05 | Complete (2026-07-12) |
| 58 | Providers Panel | PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, PROV-06 | Complete (2026-07-12; UAT deferred to milestone end) |
| 59 | Reverse-Request Channel & Security Foundation | CHAN-01, CHAN-02, CHAN-03, CHAN-04, CHAN-05, CHAN-06, CHAN-07 | Complete (2026-07-14; UAT deferred to milestone end) |
| 60 | Adapter Contract & Claude Code MVP | ADAPT-01..05, CLAUDE-01..04 | Complete (2026-07-14; UAT deferred to milestone end) |
| 61 | Delegation UX & SW-Eviction Persistence | UX-01..06, LIFE-01..04 | Complete (2026-07-15; UAT deferred to milestone end) |
| 62 | CI Drift-Smoke Gate & Doctor Extensions | DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04 | Planned; ready to execute |
| 63 | Native-Messaging Host | NATIVE-01, NATIVE-02, NATIVE-03, NATIVE-04 | Not started |
| 64 | OpenCode Adapter | MULTI-01, MULTI-02, MULTI-03 | Not started |
| 65 | Codex Adapter | MULTI-04, MULTI-05, MULTI-06 | Not started |

Coverage: 51/51 v0.9.91 requirements mapped, 37/51 complete, 0 orphaned. Dependency chain: 57 (identity data) → 58 (provider selection UI reads it) → 59 (security foundation before any spawn code) → 60 (adapter contract needs the channel) → 61 (UX/lifecycle needs the adapter) → 62 (drift gate needs something to check) → 63 (native-host closes the "agent offline" cliff after that state exists) → 64 → 65 (contract must be stable before adapter breadth). Security-first hard rule is satisfied: Phase 59 was code-green before Phase 60 spawn code landed.

## Hard Invariants (v0.9.91)

- **Security-first hard rule.** All CHAN-01..CHAN-07 land in Phase 59 together, BEFORE any spawn code exists in Phase 60. Not deferrable to a "hardening" phase.
- **INV-01 (byte-stable MCP wire).** Every wire addition is additive: new frame types (`ext:request` / `ext:response` / `ext:event`) + optional payload fields only. No existing `MCPMessageType` value or tool schema changes across the entire milestone; a byte-freeze regression test proves this in every wire-touching phase.
- **INV-03 (BYOK provider parity).** `universal-provider.js` continues to see only the existing 7 `api`-kind provider values across the whole milestone; `agent`-kind values never leak into request-builders.
- **INV-04 (MV3 SW-survivability).** The `setTimeout`-chained iterator pattern is preserved; delegation lifecycle persists to `chrome.storage.session` per progress event and heartbeats WS every 20 s.
- **INV-05 (no resurrection of sunset modules).** `extension/agents/*` background-agents surface (retired in v0.9.45rc1) stays frozen; the new provider surface is MCP-client identity, a different concept.
- **Task-mode only for v0.9.91.** Every adapter's `caps.chatMode: false`. Chat-mode continuity via `--resume` / `codex resume` / `opencode --continue` is v2 scope (CHAT-FUTURE-01/02).
- **No `--dangerously-skip-permissions` / `--yolo` / `--auto` in the spawn path.** Anywhere. Ever. CHAN-07 makes this a permanent invariant enforced by a CI grep gate; the Codex adapter (Phase 65) explicitly must NOT reference `--full-auto`.
- **No `@anthropic-ai/claude-agent-sdk` embedded in FSB.** Anthropic banned third-party products from using consumer subscription auth via the SDK (enforcement Apr 4 2026). Shell to the user's installed `claude` binary only.
- **No native-messaging permission through Phases 57-62.** The extension has NO way to wake the daemon in those phases; delegation UX must ship an honest "Agent offline → `doctor`" state (LIFE-03). Phase 63 (NATIVE) adds the optional wake-host later without relaxing any CHAN rule — the host itself never spawns agent CLIs (NATIVE-03).
- **Source-pin tripwire discipline.** Test suite pins exact token counts + substrings on extension source. Every extension-touching commit updates paired tripwires in the same commit; the full suite runs green from commit 1 of every phase.
- **Same-context dispatch in the MV3 SW.** Delegation dispatcher integrates through `globalThis.fsbDispatchInternalMessage` / the Phase 225-01 bus, NOT `chrome.runtime.sendMessage` (auto-memory: sendMessage never loops back in-SW).
- **Adapter breadth: Claude Code + OpenCode + Codex; NO Gemini.** GEMINI-FUTURE-01 defers Gemini until a live `--help` capture + JSONL schema pinning are done.

## Accumulated Context

### Decisions

Full decision log for prior milestones (v0.9.99 Phase 26-34, v1.0.0, v1.1.0, v1.2.0) lives in PROJECT.md, ROADMAP.md's `## Completed Milestones` section, and the archived `.planning/milestones/*` files. Those decisions concern the T1 capability-catalog surface and the showcase-i18n surface; they have zero shared surface with v0.9.91's provider/delegation work and are not repeated here to keep this file a digest.

v0.9.91-specific decisions so far:

- [Roadmap]: Phase structure follows the research SUMMARY.md's dependency chain (identity → provider UI → security → adapter contract + Claude MVP → UX/lifecycle → drift → native → OpenCode → Codex). ADAPT and CLAUDE combined in one phase (60) because the Claude Code MVP is the contract's first real implementation; UX and LIFE combined in one phase (61) because the UX affordances (kill switch reclaims tabs, offline state, take-control) are inseparable from the persistence semantics that make them SW-eviction-safe.
- [Roadmap]: MULTI split across two phases (64 = OpenCode, 65 = Codex) rather than combined into one, because each adapter has its own version-pinning spike, fixture capture, and auth-detection story — the incremental phase cost is small versus the risk of one adapter's drift blocking the other's ship.
- [Roadmap]: NATIVE placed at Phase 63 (after DRIFT) rather than immediately after UX, so the doctor extensions from DRIFT (compatibility matrix, per-adapter section) exist before the native host reports its own state; NATIVE cannot ship BEFORE UX because it augments UX's "Agent offline" state.
- [Roadmap]: Security-first hard rule is enforced by phase ordering AND by the CHAN-07 CI grep gate landing in Phase 59; the gate protects future patches (including Phase 65's Codex adapter, which must NEVER reference `--full-auto`).
- [Roadmap]: DRIFT is INCLUDED in v0.9.91 (Phase 62) per user confirmation; the drift gate is scoped to Claude Code from its first commit and extended per-adapter as OpenCode and Codex land in Phases 64/65.
- [Roadmap]: NATIVE is INCLUDED in v0.9.91 (Phase 63) per user confirmation; the additive `nativeMessaging` permission is the only permission change in the milestone.
- [Roadmap]: Every `agent`-kind cost row displays "included in your subscription" + real token/turn/duration counts — never a fabricated dollar amount (PROV-06). The Codex adapter's per-auth-state copy (Phase 65) is the strictest test of this discipline.
- [Roadmap]: The reverse-request channel reuses the existing `ws://localhost:7225` bridge; no new port is added (SUMMARY.md architecture decision; a separate supervisor port is a documented fallback if hub-forwarding proves fragile during Phase 59 implementation).
- [Phase 57]: Read MCP client identity and inventory lazily through feature-detected AgentScope suppliers so bare scopes and structural mocks remain compatible.
- [Phase 57]: Reuse PLATFORMS and resolvePlatformTarget for installed-client detection, with fixed shell-free Claude Code version probes.
- [Phase 57]: Deliver one memoized client inventory through both system:client-inventory and agent:register payload.platforms.
- [Phase 57]: Keep MCP clientInfo observational and bounded — Only sanitized name/version evidence is persisted; authority, cap, ownership, and routing logic remain unchanged.
- [Phase 57]: Converge both installed-inventory delivery paths on replaceInstalled — Registration piggybacks and system frames replace only installed evidence while preserving clicked, connected, and unknown siblings.
- [Phase 57]: Persist onboarding intent without awaiting storage — Resolve current at click time and serialize same-page writes so feedback timing is unchanged and rapid clicks retain counts.
- [Phase 57]: Join known MCP identities only through a frozen exact alias vocabulary — Unknown names remain visible as raw, non-authoritative entries; no fuzzy matching or Gemini aliasing.
- [Phase 57]: Re-read durable provider evidence for every merged query — Clicked, installed, connected, and live evidence stay separate and no recommendation is derived.
- [Phase 57]: Guard getMcpClients with the existing own-extension sender check and direct registry access — This preserves same-context service-worker dispatch without self-send.
- [Phase 57]: Expose getMergedClients as a non-enumerable additive helper — Direct consumers gain the method while the locked enumerable API remains compatible.
- [Phase 58]: Keep provider settings and recommendation evidence separate — modelProvider remains closed to seven API ids, agent intent stays in agentProviderId, and fixed live/installed/clicked evidence changes only one advisory recommendation.
- [Phase 58]: Keep the radio roster as an in-form projection — API and agent selections use the existing Save/Discard boundary, inactive-kind values survive switching, and agent ids never enter modelProvider or discovery maps.
- [Phase 58]: Preserve the last successful evidence snapshot on refresh failure and label it stale — provider evidence and the single recommendation remain advisory and never mutate selection, API inputs, Save state, or storage.
- [Phase 58]: Keep account and billing truth independent from client evidence — absent auth renders Billing not reported; only explicit future subscription/API/credit/Zen/provider modes can change that label.
- [Phase 58]: Announce background provider refreshes through polite status and reserve one assertive alert for an explicit manual failure; never turn the full details region into an alert.
- [Phase 60]: Keep spawn authority serve-only and recovery-gated — bind HTTP first, finish exact journal recovery second, then advertise `agent-spawn`; stdio and incidental bridges never own a supervisor.
- [Phase 60]: Use one closed Claude Code 2.1.177 profile with a retained native path, immutable MCP-only argv, a shipped static FSB agent, task text through stdin only, scrubbed provider-key environment, and truthful schema-derived fixture provenance.
- [Phase 60]: Treat process-tree or runtime cleanup uncertainty as daemon-wide degradation — stop accepting starts, preserve exact evidence, and drive one orderly nonzero shutdown rather than risk overlapping browser authority.
- [Phase 60]: Bind delegation lifetime to its authenticated reverse route and join setup, stdin, cleanup, and cancellation so every topology/exit/error race settles exactly once without replay.
- [Phase 61 planning]: Keep provider selection background-authoritative and exact; pure preflight plus challenge-bound trust enable precede all visible mutation, while Providers gets a separate authority-reducing confirmation reset.
- [Phase 61 planning]: Persist one bounded redacted typed entry per normalized event before fanout; per-correlation bridge tails, closed snapshots/terminal codes, and UI-only exact sequence suppression prevent final-over-write and recovery ambiguity.
- [Phase 61 planning]: The controller owns id-keyed run records and active-tab eligibility; confirmed hold moves every exact mapped tab into one sealed lease, complete restore precedes resume, and Stop waits tree settlement before exact release/count.
- [Phase 61 planning]: Active delegation liveness uses one ref-counted 20-second exact-nonce heartbeat with daemon echo and three-miss disconnect; restart loss additionally requires generation plus bounded recovery disposition.
- [Phase 61 Plan 01]: Keep API-kind agent ids storage-compatible but inactive at pure preflight; only exact `agent` + `claude-code` enters delegated routing, with closed unsupported/offline/unpaired results.
- [Phase 61 Plan 01]: Persist a challenge's one-use trust-write slot before local trust enable, so replay and local-storage failure cannot reopen authority; exact provider-local clear remains the sole false path.
- [Phase 61 Plan 01]: Keep provider trust outside broad Config authority, and require a freshly minted, atomically consumed internal challenge for trusted and untrusted starts alike.
- [Phase 61 Plan 02]: Treat the bounded redacted session ledger as the visibility commit point; only a successfully persisted canonical entry may change controller state or fan out.
- [Phase 61 Plan 02]: Reject persisted duplicate, conflicting, gapped, reversed, or identity-mismatched sequences as corruption; delivery deduplication remains UI-only.
- [Phase 61 Plan 02]: Isolate timers and settlement per server delegation id, seal every mapped tab into one hold lease, and restore the complete lease before daemon resume.
- [Phase 61 Plan 03]: Serialize the global observer roster on each pending correlation's private tail; matching final settlement waits for that tail and observer failure rejects only that request.
- [Phase 61 Plan 03]: Replace ordinary keepalive with one Set-refcounted 20-second exact-nonce loop only while delegation owners exist; three misses classify disconnected without restart or replay inference.
- [Phase 61 Plan 03]: Pin exact Chrome 116 while leaving permissions, worker scripts, and bridge authority unchanged; doctor/setup remain data-only future UI behavior with no native, shell, process, or daemon-restart path.
- [Phase 61 Plan 04]: Carry the daemon-minted delegation id only on the initial bounded registration sidecar; the sole controller gate binds it once to a fresh extension-minted agent and every denial rolls the ordinary agent back.
- [Phase 61 Plan 04]: Persist cloned candidate registry state before adopting delegation binding, hold seal, restore, or exact release, so storage rejection and index drift leave the prior complete authority unchanged.
- [Phase 61 Plan 04]: Treat the five-minute hold deadline as cancellation-required rather than ownership release; complete tab/token reservations remain unclaimable through expiry and worker reload.
- [Phase 61 Plan 04]: Refuse generic/grace release for controller-mapped agents; only exact delegation-plus-agent cleanup may remove their distinct active and held tab union and report its count.
- [Phase 61 Plan 05]: Keep hold, resume, cancel, settlement, and status inside the one serve-owned supervisor; the five-method adapter contract remains unchanged.
- [Phase 61 Plan 05]: A POSIX lifecycle transition is acknowledged only after the retained group and exact tree are confirmed before and after its signal; unsupported or unverifiable paths converge to confirmed cancellation.
- [Phase 61 Plan 05]: Restart loss requires a prior daemon generation plus an owner-only persisted post-cleanup disposition; same-generation records, transport disconnect, and failed cleanup never qualify.
- [Phase 61 Plan 06]: Keep background as the sole delegation composition root; authoritative provider reload, preflight, challenge consumption, daemon acceptance, and controller/UI allocation remain strictly ordered before any legacy mutation.
- [Phase 61 Plan 06]: Treat same-generation supervisor status as observation only; generation change without matching explicit restart disposition remains disconnected and classification-pending without adopting the new generation.
- [Phase 61 Plan 06]: Retain one heartbeat owner for every hydrated nonterminal id and release it only after terminal persistence and exact tab cleanup; all owners continue to share the bridge's single interval.
- [Phase 61 Plan 06]: Recover held state only from the registry's complete exact sealed lease; a missing or inconsistent lease cancels rather than recreating ownership.
- [Phase 61 Plan 07]: Render only closed canonical snapshot fields through text-only DOM construction; presentation strings, provider-native payloads, URLs, and style metadata never become UI authority or executable markup.
- [Phase 61 Plan 07]: Bind one exact server delegation id to one selected conversation in bounded session storage, hydrate silently before subscribing, and announce only strictly newer matching sequences.
- [Phase 61 Plan 07]: Change consent, held/running, stopping/stopped, disconnect, and restart-loss presentation only after authoritative background snapshots; pending controls never invent lifecycle state.
- [Phase 61 Plan 07]: Limit recovery actions to copying the literal doctor command or opening the local Providers surface; no side-panel action executes, restarts, or invokes native code.
- [Phase 61 Plan 08]: Keep one eight-scenario milestone-end live ledger with every result `human_needed`, pending, and empty; deterministic evidence proves the ledger is honest but never substitutes for performing it.
- [Phase 61 Plan 08]: Close the phase contract mechanically across all 23 task rows, UX/LIFE requirements, D-01..D-28, T61-01..14, typed schemas, architecture links, UI rules, and forbidden authority patterns.
- [Phase 61 Plan 08]: Restore only exact paths that were already unstaged before a full-suite run; never restore, stage, or otherwise mutate the Git index, and continue failing closed on newly dirty clean paths or untracked entries.
- [Phase 61 Plan 08]: Preserve the first Wave-5 wrapper preservation red separately from the explicitly authorized corrected green; no failed evidence is erased or relabeled.
- [Milestone]: Defer every live/human UAT checklist to one milestone-end sweep; automated/source verification and clean review remain mandatory per phase, and no deferred item is silently marked passed.

### Pending Todos

None. Phases 57-61 are automated/source complete; Phase 62 discussion and planning are next.

### Blockers/Concerns

No active blocker.

- **Milestone-end UAT gate:** Phase 58's 12 live Providers checks, Phase 59's 4 live pairing/lifecycle/accessibility checks, Phase 60's 7 authenticated CLI/OS/browser checks, and Phase 61's 8 consolidated consent/theme/handoff/stream/worker/endurance/POSIX/restart scenarios remain pending. Per user instruction, all live UAT is accumulated and audited at milestone end; automated/source evidence is green through Phase 61 Plan 08, and no live pass is inferred.

- **Phase 59 pairing decision resolved:** Use explicit `fsb-mcp-server pair`, a durable exact extension-Origin binding, a per-daemon 32-byte session credential, `pair --reset` for deliberate rebind, per-frame sessionId revalidation, and a secret-free `bridge.auth-status` acknowledgement. Silent TOFU is rejected.

Phase 60 resolved the static inline-agent/profile and Windows shell-free resolution questions in source and deterministic tests. Their genuine installed-CLI corroboration remains in the deferred Phase 60 UAT ledger. One later research item remains:

- OpenCode HTTP-server-vs-spawn shape (Phase 64) — `opencode serve` + `run --attach` may be a cheaper reuse path than cold spawn.

## Deferred Items

Items acknowledged and carried forward from previous milestone closes (Chrome MV3/manual UAT evidence gaps, not fabricated passes; procedures archived under `.planning/milestones/*/` and `.planning/phases/*/`). None of this debt blocks v0.9.91.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat_gap | Phase 61 / 61-HUMAN-UAT.md (consent/theme/handoff, authenticated stream, worker eviction, 45-minute endurance, POSIX lifecycle, daemon restart classification) | deferred to v0.9.91 milestone end; 8 scenarios | Phase 61 Plan 08 |
| uat_gap | Phase 60 / 60-HUMAN-UAT.md (authenticated isolation, genuine JSONL provenance, live MCP read, POSIX/Windows tree kill, crash recovery, browser ownership/vault/consent) | deferred to v0.9.91 milestone end; 7 scenarios | Phase 60 Plan 04 |
| uat_gap | Phase 59 / 59-HUMAN-UAT.md (live pair, daemon restart invalidation, Chrome session clearing, accessibility/theme) | deferred to v0.9.91 milestone end; 4 scenarios | Phase 59 Plan 04 |
| uat_gap | Phase 58 / 58-HUMAN-UAT.md + 58-VISUAL-QA.md (live Providers theme/responsive/keyboard/motion and extension-state checks) | deferred to v0.9.91 milestone end; 12 scenarios | Phase 58 Plan 03 |
| uat_gap | v1.2.0 Phase 53 / 53-VISUAL-QA.md (VISUAL-01 live DE/CJK browser visual spot-check) | human_needed | v1.2.0 Phase 53 |
| uat_gap | Phase 27 / 27-HUMAN-UAT.md (live FETCH-05 logged-in-shape UAT-27-01 + contrast + origin-pin) | human_needed; 3 scenarios | v0.9.99 Phase 27 |
| uat_gap | Phase 29 / 29-HUMAN-UAT.md ([ASSUMED] internal-endpoint live capture) | human_needed | v0.9.99 Phase 29 |
| uat_gap | Phase 30 / 30-HUMAN-UAT.md (UAT-30-01 live render/Grant/badge smoke) | human_needed | v0.9.99 Phase 30 |
| uat_gap | Phase 31 / live discovery UAT | human_needed | v0.9.99 Phase 31 |
| uat_gap | Phase 32 / 32-HUMAN-UAT.md (UAT-32-01 live self-healing) | human_needed; partial | v0.9.99 Phase 32 |
| uat_gap | Phase 33 / 33-HUMAN-UAT.md (live media playback fidelity) | human_needed | v0.9.99 Phase 33 |
| uat_gap | Phase 34 / 34-HUMAN-UAT.md (live upload fidelity) | partial: UAT-34-02 pass; UAT-34-01 MCP text-file smoke pass, binary/submit checks still human_needed; UAT-34-03/04 still human_needed | v0.9.99 Phase 34 |
| uat_gap | Phases 01/16/20/25 (v0.10/v0.11/v0.12 live-browser) | human_needed/partial | prior closes |
| i18n_debt | WARNING-02 picker-cookie short-circuits bare-`/` Accept-Language redirect | closed in v1.2.0 Phase 56 (ROUTE-01/02) | v0.9.63, carried 6+ milestones |

Carry-forward publish/tag gates (pre-existing, user-gated): `npm publish fsb-mcp-server@0.9.0`; `npm publish fsb-mcp-server@0.10.0`; branch + tag pushes for v0.9.62 / v0.9.63 / v0.9.69 / v0.10.0 / v0.11.0 / v0.12.0 / v1.2.0; `clawhub publish "skills/FSB Skill"`; public package publication. None of this blocks v0.9.91.

v2 deferred (see REQUIREMENTS.md v0.9.91 v2 section): CHAT-FUTURE-01/02 (chat-mode continuity via `--resume` / `codex resume` / `opencode --continue` + per-thread cwd pinning); GEMINI-FUTURE-01 (Gemini CLI adapter after live `--help` capture + JSONL schema pinning); ACP-FUTURE-01 (`@zed-industries/agent-client-protocol` unification once ≥2 non-Claude adapters have shipped); REMOTE-FUTURE-01 (remote/mobile delegation surfaces — v0.9.91 is explicitly localhost-only).

## Session Continuity

Last session: 2026-07-16T17:12:15.202Z
Stopped at: Phase 62 planned and independently verified; ready for autonomous execution
Resume file: .planning/phases/62-ci-drift-smoke-gate-doctor-extensions/62-01-PLAN.md

## Next Actions

Execute all six approved Phase 62 plans, then run automated review and verification. Keep every accumulated live UAT item pending until the single milestone-end sweep.
