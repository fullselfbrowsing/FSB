# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.9.34 -- Vault, Payments & Secure MCP Access

**Shipped:** 2026-04-22
**Phases:** 8 | **Plans:** 11

### What Was Built
- Vault lifecycle messaging and eager session/payment-access rehydration across service worker restarts
- Payment method backend handlers, masked metadata listing, separate unlock state, and options-page payment management UI
- Autopilot credential/payment fill execution with sidepanel payment confirmation before any payment fill
- MCP vault tools and bridge handlers that keep raw secrets inside the extension/content-script boundary
- Phase 197 security boundary fixes for active-tab domain derivation, sidepanel MCP payment confirmation, content-script log redaction, and the 125-second payment confirmation timeout

### What Worked
- Phase 197 gap closure was small and focused: one code commit closed the timeout mismatch and one docs commit updated verification/UAT state.
- The proxy command pattern remained coherent: MCP clients receive opaque IDs and masked metadata while the extension resolves secrets locally.
- Sidepanel confirmation became a shared security pattern across autopilot and MCP payment fills.

### What Was Inefficient
- The milestone audit was run before the Phase 197 gap-closure work and was archived as stale `gaps_found` instead of being rerun.
- Requirements traceability was incomplete at close: 19 v1 requirements remained unchecked even though roadmap phases were marked complete.
- Phase 195 and Phase 196 were closed as 0-plan phases, which made later audit and requirement attribution weaker.

### Patterns Established
- Active-tab authority pattern: derive credential/payment target domains from browser state rather than MCP payloads.
- Sensitive-param redaction pattern: content-script fill actions redact params before logging even if logging is later enabled.
- Human-gated MCP timeout pattern: server-side bridge timeouts must exceed browser-side confirmation windows.

### Key Lessons
1. Run milestone audit after all gap-closure phases, not before the final closure commit.
2. Requirements checkboxes and traceability rows need to be updated during each phase, not reconstructed at milestone close.
3. Zero-plan phases make archives look complete while weakening evidence; future milestones should create explicit audit/verification plans even for hardening passes.

### Cost Observations
- Model mix: inherit profile.
- Notable: The final closure was code-small but documentation-heavy because audit and requirements state lagged behind implementation.

---

## Milestone: v0.9.30 -- MCP Platform Install Flags

**Shipped:** 2026-04-18
**Phases:** 3 | **Plans:** 6

### What Was Built
- Platform registry module mapping 10 MCP platforms to config paths, formats, and entry shapes per OS
- Format-aware config engine: read-merge-write for JSON, JSONC, TOML, and YAML with .bak backups and idempotency
- Install/uninstall CLI with per-platform flags for all 7 JSON-format clients
- Non-JSON platform support: Claude Code CLI delegation (execSync), Codex TOML, Continue YAML
- --dry-run preview and --all bulk install/uninstall across all 10 platforms

### What Worked
- Data-driven platform registry pattern: each platform described as config data, single ConfigWriter handles all formats -- no per-platform code branches
- Clean phase dependency chain (registry -> CLI wiring -> extended flags) kept each phase focused
- Zero-dep library choices (smol-toml, yaml, strip-json-comments) kept the install lightweight
- All 3 phases executed in a single day with stable sub-10min plan durations

### What Was Inefficient
- REQUIREMENTS.md was stale (from v0.9.27) during the entire milestone -- requirements were only tracked in ROADMAP.md phase details
- No milestone audit was created before completion -- should have run /gsd-audit-milestone

### Patterns Established
- Platform registry map pattern: platform metadata as data, not code, enabling new platforms without code changes
- Format-gate removal pattern: start with restricted format support, remove gates as format parsers ship
- CLI delegation pattern for platforms that have their own install tooling (Claude Code)

### Key Lessons
1. Requirements files should be created fresh at milestone start -- stale files from prior milestones cause confusion
2. Platform-as-data patterns scale well: adding an 11th platform requires only a registry entry, not new code
3. Format diversity (JSON/JSONC/TOML/YAML) is manageable with a unified read-merge-write abstraction

### Cost Observations
- Model mix: quality profile (opus for planning and execution)
- Notable: Compact milestone -- 3 phases, 6 plans, single-day execution

---

## Milestone: v0.9.7 -- MCP Edge Case Validation

**Shipped:** 2026-03-22
**Phases:** 50 | **Plans:** 100 | **Tasks:** 183

### What Was Built
- 50 edge case prompts tested via MCP manual mode across 5 categories (canvas, micro-interaction, scroll, context bloat, dark patterns)
- 6 new CDP tools: scroll_at, click_and_hold, drag_drop, select_text_range, drop_file, drag_variable_speed
- 30+ site guides with real-world selectors, workflows, and automation intelligence
- 50 autopilot diagnostic reports with 500+ recommendations catalogued
- 2 PASS, 46 PARTIAL, 2 SKIP-AUTH outcomes

### What Worked
- Autonomous execution: 50 phases completed in ~3 days with minimal human intervention
- Two-plan-per-phase pattern (01: tooling/site guide, 02: test/diagnostic) kept phases focused and parallelizable
- Smart discuss with --auto flag eliminated interactive questioning overhead for 50 repetitive phases
- Site guide creation captured real-world DOM knowledge that will feed autopilot refinement
- Diagnostic report format (what worked, what failed, tool gaps, autopilot recommendations) created a clear evidence base for v0.9.8

### What Was Inefficient
- WebSocket bridge disconnect persisted from Phase 55 onward, causing 46/50 PARTIAL outcomes -- should have been diagnosed and fixed early
- Verifier agent was skipped for 43 phases to maintain execution speed -- created tech debt of missing VERIFICATION.md files
- HTTP-only validation insufficient for client-rendered SPAs (TikTok, X/Twitter, Observable) -- resulted in "selectors untestable" findings
- Each diagnostic report followed the same template with mostly identical boilerplate (WebSocket blocker section) -- could have been templatized

### Patterns Established
- Edge case validation pattern: site guide + diagnostic report per prompt
- CDP tool creation pattern: manual.ts (MCP) + actions.js (content) + background.js (relay)
- Elimination-based heuristics for dark patterns (ad detection, button classification, checkbox scanning)
- Text/semantic-based identification over positional/visual for randomized UI elements

### Key Lessons
1. MCP tools and autopilot tools diverged -- new tools added to MCP but not to autopilot's CLI_COMMAND_TABLE. Must keep both in sync.
2. WebSocket bridge is a single point of failure for live testing. Needs health check and auto-reconnect.
3. PARTIAL outcomes provide value (tooling validated, strategies documented) even without full live execution.
4. Site guides are the bridge between MCP intelligence and autopilot capability -- they encode what the AI learned.
5. 50 phases in 3 days is sustainable with autonomous execution, but quality gates (verification) shouldn't be skipped.

### Cost Observations
- Model mix: quality profile (opus-heavy for planning, sonnet for execution)
- Sessions: ~331 commits across 3 days
- Notable: Two-plan structure kept individual plan execution fast despite 100 total plans

---

## Milestone: v0.9.36 -- MCP Visual Lifecycle & Client Identity

**Shipped:** 2026-04-24
**Phases:** 3 | **Plans:** 6 | **Tasks:** 12

### What Was Built
- Explicit `start_visual_session` / `end_visual_session` MCP tools with a trusted client-label allowlist
- Optional `session_token` threading for `report_progress`, `complete_task`, `partial_task`, and `fail_task`
- Live overlay badge plus mirrored dashboard and DOM-stream identity/lifecycle rendering
- Persisted client-owned visual sessions with reinjection/service-worker replay and stale-session cleanup
- Packaged smoke coverage and MCP docs for the visual-session lifecycle and the `run_task` boundary

### What Worked
- Reusing canonical overlay/session metadata across background, content, dashboard, and docs kept the badge feature incremental instead of creating parallel contracts.
- The explicit start/end contract matched the user's mental model better than trying to infer visible ownership from unrelated MCP tool calls.
- Focused lifecycle tests caught idempotent cleanup and stale-message edge cases before the docs were finalized.

### What Was Inefficient
- The milestone-close CLI created the archive snapshots quickly, but the live ROADMAP/PROJECT state still needed manual curation for the between-milestones state.
- No standalone milestone audit file was created before archive, continuing the recent pattern of relying on phase summaries plus archived requirements for closeout evidence.
- Progress/finalization semantics were layered into shared task-status tools, which required extra care to preserve narration-only `hadEffect: false` behavior.

### Patterns Established
- Explicit visual-session ownership pattern: caller starts, threads a token, and ends the same visible session.
- Trusted client identity pattern: one allowlisted label shared across server, dispatcher, overlay, and preview surfaces.
- Replay-safe finalization pattern: persisted `finalClearAt` deadlines avoid extending stale glow after reinjection or service-worker churn.

### Key Lessons
1. If a user wants "the same glow, but from MCP," explicit lifecycle tools are cleaner than overloading autopilot-only status paths.
2. Shared canonical metadata (`sessionToken`, `clientLabel`, `version`, `lifecycle`) is what keeps live and mirrored UI surfaces honest.
3. Milestone-close automation is most reliable when the archive generator and the human-curated PROJECT/ROADMAP review are treated as separate steps.

### Cost Observations
- Model mix: inherit profile.
- Notable: Small milestone by phase count, but high coordination value because it aligned server tools, extension runtime, overlay UI, preview UI, and docs around one contract.

---

## Milestone: v0.9.60 -- Multi-Agent Tab Concurrency (MCP 0.8.0)

**Shipped:** 2026-05-08
**Phases:** 11 | **Plans:** 30 | **Tasks:** 47

### What Was Built
- Agent identity foundation: FSB-minted `agent_<uuid>` IDs via `crypto.randomUUID()`, registry mirrored to `chrome.storage.session` with SW-wake reconciliation, promise-chain mutex
- AgentScope + bridge wiring: `agent_id` threaded through every MCP tool registration without behavior change
- `run_task` lifecycle return-on-completion (Phase 236 reborn): 600s safety net, lifecycle event always wins, 30s `notifications/progress` heartbeats, SW-eviction yields `partial_state`
- Tab-ownership enforcement: inline `checkOwnershipGate` at `dispatchMcpToolRoute` with three typed reject codes; `(agentId, tabId, ownership_token)` enforced same-microtask
- Pooling, configurable cap (1-64, default 8), `connection_id`-keyed reconnect grace, pool-shrink-vs-release order independence
- Ownership-gated `back` MCP tool with structured `{status, resultingUrl, historyDepth}` results
- Background-tab audit + UI: agent-suffix client badge, popup/sidepanel owner chips, options.html cap control, foreground side-effect audit across 25+ tools
- `fsb-mcp-server@0.8.0` prepared: SDK `^1.29.0`, version metadata, README, CHANGELOG, multi-agent tool descriptions; tag-ready
- Post-action `change_report` on every action tool (URL delta, scoped node diffs, dialogs, focus shift), size-capped with `truncated`
- Agent-scoped tab resolution (Phase 246, gap-closure): replaced `chrome.tabs.query({active:true})` with registry-driven resolver across read tools, visual-session, and ~37 action tools; `open_tab` default to background; D-16 closure folds resolved tabId back into routeParams
- Bootstrap-safe recovery from restricted active tabs (Phase 247, gap-closure): `open_tab`/zero-owned `navigate`/`switch_tab`/`list_tabs` work from `chrome://newtab/` while still rejecting cross-agent owned tabs; protocol error labels accurate

### What Worked
- Independent-phase parallelization: Phase 239 (run_task fix) shipped in parallel with 237/238 because it had no dependency on the multi-agent surface, eliminating critical-path drag
- Single dispatch chokepoint pattern paid off again: every cross-cutting concern (ownership, resolver, change_report) lands in one place rather than 25+ tool handlers
- Byte-identity parity test (closes RESEARCH.md Pitfall 2) made the legacy:* preservation contract enforceable rather than aspirational
- Phase 246/247 as gap-closure on existing REQ-IDs (no new requirement IDs minted) kept traceability clean while still acknowledging real protocol bugs surfaced in smoke tests
- VERIFICATION.md `human_needed` markers held -- 12 outstanding human-UAT items were honestly carried as known-debt rather than auto-marked passed

### What Was Inefficient
- Smoke testing surfaced two distinct gap-closure phases (246 + 247) AFTER the milestone roadmap was authored; the original Phase 244 audit pass missed them. Earlier hostile multi-agent smoke would have folded both into the original roadmap
- The auto-generated MILESTONES.md entry from `gsd-tools milestone complete` produced low-quality "1. [Rule N]" extracts because `extract-accomplishments` walked into RESEARCH-style files; required manual deletion of the duplicate entry and reliance on the pre-curated entry
- Long `run_task` 5-run live soak was deferred -- automated lifecycle coverage is green but the deferred soak is recurring debt
- 12 human-UAT items remain `human_needed` across Phase 239 and 246 VERIFICATION.md files; the milestone audit accepted these as documented caveats rather than blocking on them
- One live `switch_tab` unowned-target branch could not be reproduced because the local browser auto-owned candidate tabs as `legacy:sidepanel`; coverage moved to automated dispatcher tests instead of being able to capture live evidence

### Patterns Established
- FSB-minted, caller-cannot-supply agent ID pattern: eliminates spoofing class entirely; ID is FSB-internal authority
- Resolver-feeds-routeParams pattern (D-16): the gate sees the same tabId the resolver chose, eliminating dispatch-time TOCTOU
- `legacy:<surface>` synthesized agent ID pattern: preserves popup/sidepanel/autopilot UX byte-for-byte while routing the same dispatch path through the multi-agent gate
- Bootstrap-safe tool classification: small whitelist of recovery tools (`open_tab`, `navigate`, `switch_tab`, `list_tabs`) that work without content-script attachability while still respecting cross-agent ownership
- Action vs read tool change_report contract: action tools always return; read tools never return -- a clean type-level distinction

### Key Lessons
1. Smoke-test multi-agent scenarios EARLIER -- gap-closure phases (246, 247) added 4 plans of work after the original roadmap was authored because foreground-only test paths missed agent-scoped resolution gaps and restricted-tab recovery
2. Auto-generated milestone accomplishments from `gsd-tools milestone complete` pull from the wrong files (rules-extracted from research/diagnosis docs, not curated from one-liners); always pre-curate the MILESTONES.md entry before running the CLI archival, or expect to delete the auto-generated duplicate
3. Single dispatch chokepoint compounds in value as more cross-cutting concerns land: ownership gate, resolver, change_report, and protocol error labeling all benefit from the shared chokepoint architected in Phase 240
4. `human_needed` UAT items should be tracked as first-class closeout debt with explicit "verify by Xms after release" deadlines; carrying 12 of them silently across milestones risks them becoming permanent
5. Independent-phase parallelization (Phase 239 alongside 237/238) demonstrably accelerates delivery; the roadmapper should explicitly identify and call out parallelizable phases at authoring time

### Cost Observations
- Model mix: inherit profile (no explicit override)
- Notable: 11 phases with 3 distinct gap-closure waves (244 hardening + 246 resolver + 247 bootstrap) reflects "ship the surface, then audit, then audit again" pattern rather than a clean linear roadmap
- Independent-parallel Phase 239 collapsed the 8-phase critical chain to 7-phase

---

## Milestone: v0.9.91 -- MCP Clients as Providers

**Shipped:** 2026-09-28
**Phases:** 9 | **Plans:** 61

### What Was Built
- Durable MCP client identity (handshake clientInfo, a 21-client installed sweep, copy intent) behind one guarded `getMcpClients` view
- A Providers panel with explicit `api` vs `agent` kinds and one evidence-based recommendation, with BYOK settings preserved
- An authenticated reverse-request channel with a rotating session secret, exact Host/Origin checks, secret redaction and a permanent forbidden-flag CI gate
- One five-method adapter contract and spawn supervisor running Claude Code, OpenCode and Codex, with pinned profiles, recorded fixtures and drift CI
- Delegation UX (consent, live feed, Take Control/Stop, heartbeat, service-worker-eviction recovery) and an optional native wake host that only starts `serve`

### What Worked
- Security-first ordering: the channel's trust boundary (Phase 59) landed and was tested before any spawn code existed (Phase 60).
- The adapter contract stayed unchanged while OpenCode and Codex were added, which proved the abstraction.
- Source-pin contract tests caught drift early, and every phase kept the full suite green.

### What Was Inefficient
- Every live check was deferred to one milestone-end sweep that never ran; 48 scenarios accumulated and were waived at close, so the milestone has no live evidence.
- The milestone sat at `human_needed` for two months after implementation finished (2026-07-22 to 2026-09-28).
- Tests read live planning files (phase folders, ROADMAP.md, REQUIREMENTS.md), so archiving the milestone required repointing test paths.

### Patterns Established
- Closing with waived UAT: record the waiver in STATE.md and MILESTONES.md and leave the UAT ledgers untouched, so no pass is fabricated.
- Tests that inspect planning artifacts read the archived milestone copies once a milestone closes.

### Key Lessons
1. Deferring all live checks to a single end-of-milestone sweep turns UAT into debt; schedule them per phase, or agree up front that closure is automated-only.
2. Point planning-artifact tests at archive paths (or keep fixtures out of `.planning/`) so milestone archival cannot break the suite.

### Cost Observations
- Model mix: inherit profile.
- Notable: 157 tasks across 61 plans; implementation ran 2026-07-10 to 2026-07-22.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v0.9 | 11 | 24 | Foundation -- reliability engineering |
| v9.0.2 | 10 | 21 | AI perception + context quality |
| v9.3 | 5 | 17 | Modularization + tech debt |
| v9.4 | 9 | 18 | Career search workflows |
| v10.0 | 15 | 37 | CLI architecture rewrite |
| v0.9.2-4 | 6 | 17 | Productivity + memory + AI quality |
| v0.9.5 | 4 | 8 | Progress overlay intelligence |
| v0.9.6 | 7 | - | Agents + remote control |
| v0.9.7 | 50 | 100 | Autonomous edge case validation at scale |
| v0.9.30 | 3 | 6 | MCP platform install flags -- compact, data-driven |
| v0.9.34 | 8 | 11 | Vault/payment/MCP security closure with accepted validation debt |
| v0.9.35 | 5 | 15 | MCP reliability before new feature expansion |
| v0.9.36 | 3 | 6 | Explicit MCP visual lifecycle and trusted client identity |
| v0.9.60 | 11 | 30 | Multi-agent tab concurrency, MCP 0.8.0, run_task lifecycle return, change_report, restricted-tab recovery |
| v0.9.91 | 9 | 61 | Agent CLIs as side-panel providers; security-first reverse channel; all live UAT waived at close |

### Top Lessons (Verified Across Milestones)

1. Keep autopilot and MCP tool registries in sync -- divergence causes capability gaps (v0.9.7)
2. Site guides encode automation intelligence that survives across sessions and modes (v9.3, v9.4, v0.9.7)
3. Two-plan phase structure scales well from 4 phases to 50 phases (v0.9.5, v0.9.7)
4. Autonomous execution at scale works but needs quality gates that don't get skipped (v0.9.7)
5. DOM-based identification beats position/visual for resilient automation (v0.9, v10.0, v0.9.7)
