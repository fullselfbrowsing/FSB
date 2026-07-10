# FSB (Full Self-Browsing)

## What This Is

FSB is an AI-powered browser automation Chrome extension that executes tasks through natural language instructions. Users describe what they want done ("search for wireless mouse on Amazon, add the first result to cart") and FSB figures out the clicks, types, and navigation to make it happen. It uses reliable element targeting with uniqueness-scored selectors, visual feedback (orange glow highlighting), and action verification to execute precisely on the first attempt. It also exposes an MCP server so external clients can drive the same live browser surface with trusted diagnostics and visible feedback.

## Core Value

**Reliable single-attempt execution.** The AI decides correctly; the mechanics execute precisely. Every click hits the right element, every action succeeds on the first try.

## Current State

**Last completed:** v1.2.0 Showcase i18n Completeness — Phases 52-56 shipped 2026-07-09. Full-page translation audit, 5-id resync + stats-274 retirement + hero/CTA transcreation, stats lint gate flip, permanent `verify-translation-drift` CI gate, and WARNING-02 locale-cookie redirect fix. VISUAL-01 browser UAT remains human_needed (`53-VISUAL-QA.md`).

**Recent shipping cadence:**
- v1.2.0 Showcase i18n Completeness -- archived 2026-07-09
- v1.1.0 T1 App Execution Expansion -- archived 2026-06-30; remaining tail rows carry explicit proof requirements before direct execution
- v1.0.0 Full App Catalog (OpenTabs Parity) -- archived 2026-06-29; T1 expansion debt carried into v1.1.0


## Current Milestone: v0.9.91 MCP Clients as Providers

**Goal:** Make installed agent CLIs (Claude Code first) first-class side-panel providers -- FSB captures which MCP clients the user installs/connects, presents them as key-less providers in a renamed Providers panel, and delegates side-panel tasks to a spawned agent CLI that drives the browser back through FSB's own MCP tools.

**Target features:**
- **Agent identity capture** -- persist which install command(s) the user copies during onboarding (multi-client, `extension/ui/onboarding.js` copy handler already has the client id); capture `clientInfo` from the MCP initialize handshake (currently discarded -- zero references in `mcp/`) and thread it through the existing `agent:register` round-trip (payload is empty `{}` today); detect installed clients from the `platforms.ts` registry's per-OS config paths (21 clients); surface connected/installed agents in the control panel.
- **Providers panel** -- rename "API Configuration" -> "Providers" (`extension/ui/control_panel.html:146`); introduce `api` vs `agent` provider kinds; agent providers hide the API-key field; recommended default driven by ground truth (connected > installed > copy-clicked).
- **Side-panel delegation (Claude Code MVP)** -- new extension->hub reverse-request channel over the existing ws://localhost:7225 bridge; daemon spawns `claude -p` headless (stream-json output, strict permission defaults, hermetic `--strict-mcp-config`, shipped `fsb` agent definition instead of prompt stuffing); the spawned CLI connects back as its own FSB agent with tab ownership; live progress streamed into the side panel; kill switch; graceful "agent offline -> doctor" state.
- **Multi-agent adapters** -- `AgentProviderAdapter` contract (detect / build / events / kill / caps); OpenCode -> Codex -> Gemini after Claude Code; task-mode vs chat-mode (`--resume`) where supported.

**Key context:**
- The spawn channel is security-critical (RCE-adjacent): extension-origin gating + shared secret + explicit consent tiers required. Bridge already rejects untrusted browser origins (`tests/mcp-bridge-topology.test.js`).
- Daemon lifecycle constraint: the extension has NO nativeMessaging permission and cannot wake any process. Delegation requires a live MCP server process (`fsb-mcp-server serve` or an open agent session). MVP ships honest offline UX + `doctor` handoff; a native-messaging host is a deferred option.
- INV-01 carries forward: MCP wire contracts stay byte-stable -- all bridge message types and tools are additive.
- Test suite has source-pin tripwires on extension files (token counts/substrings); extension-side wiring must run the suite from the first commit.
- Delegation becomes the fifth `EXECUTION_MODES` entry in `extension/ai/engine-config.js` (autopilot, mcp-manual, mcp-agent, dashboard-remote, + delegated).
- This milestone completes the v0.9.45rc1 arc (background agents retired in favor of external agent runtimes) and the v0.9.36 deferred item "derive trusted MCP client identity from connection/handshake metadata".
- Phases continue from 57.

## Last Milestone: v1.2.0 Showcase i18n Completeness

**Status:** Archived 2026-07-09. Phases 52-56 shipped; audit passed. Archive files under `.planning/milestones/v1.2.0-*`. VISUAL-01 browser UAT remains human_needed (`53-VISUAL-QA.md`).

**Goal:** Close the translation gap that reopened after v0.9.63 shipped -- full, drift-free coverage across all six supported locales (en, es, de, ja, zh-CN, zh-TW) for every showcase marketing page plus the stats page, the long-deferred locale-cookie redirect bug, and a CI gate that catches future drift automatically.

**Target features:**
- Full-page audit: verify every translatable string on every showcase page (lattice, phantom-stream, prometheus, home, mobile nav, and other surfaces added since v0.9.63) is genuinely translated in all 5 non-English locales, not just marked with an `i18n` attribute.
- Resync the trans-units whose English source actually changed in commit `6d3ad363` ("chore(i18n): sync messages.xlf with showcase copy refinements") across all 5 translated locale files (es/de/ja/zh-CN/zh-TW). Research corrected the initial estimate: only 5 of the 247 touched trans-unit blocks have real `<source>` text drift (`agents.meta.description`, `agents.schema.software.description`, `home.meta.description`, `support.faq.q.tools.a`, `support.schema.faq.tools.a`) -- the other 242 are harmless `<context-group><linenumber>` churn. The full-page audit phase (below) may surface additional drift beyond this one commit's blast radius.
- Bring the stats page into full translation and drop it from the `lint:i18n` ignore-pattern in `showcase/angular/package.json` (dashboard stays excluded -- app surface, not marketing content, out of scope for this milestone).
- Fix WARNING-02 (carried since v0.9.63): picker-set `fsb-locale` cookie no longer short-circuits the bare-`/` Accept-Language redirect for returning fresh-tab/shared-link visitors.
- New CI drift-detection gate: fail the build if `messages.xlf` source content changes without a corresponding update to all 5 translated locale files.

**Key context:** Supported locales are fixed (en source + es/de/ja/zh-CN/zh-TW) -- not up for debate, carried over from v0.9.63's `LocaleService` + locale-constants module. Builds on existing tooling: `lint:i18n` eslint check, `verify-locale-sync.mjs`, `ng extract-i18n`. This is the second attempt at closing this exact gap -- v0.9.63 left dashboard + WARNING-02 as accepted debt that then sat untouched through 6+ subsequent milestones (v0.9.69, v0.10.0, v0.11.0, v0.12.0, v1.0.0, v1.1.0).

**Progress:** Phase 52 (Full-Page Translation Completeness Audit) complete 2026-07-08 -- `audit-translation-completeness.mjs` confirms the true drift/gap scope across all 12 current routes and 5 locales: 5 drifted trans-units (matches the corrected estimate, superseding the original "247" figure), 54 orphaned ids/locale, and the `translations.stats-274.*.json` artifacts traced as 15/21 keys already merged into live XLIFF per locale (6 missing, 0 stale). This is the authoritative scope Phases 53-55 inherit.

## Last Milestone: v1.1.0 T1 App Execution Expansion

**Status:** Archived on 2026-06-30. Audit passed; automated milestone gates met. Archive files live under `.planning/milestones/v1.1.0-*`.

**Outcome:** FSB converted the v1.0.0 catalog tail from undifferentiated search/discovery support into an explicit readiness and terminal-state model. The milestone added reusable port contracts, same-origin read ports, bridge decision gates, guarded-write evidence gates, terminal-state reporting, and a write/destructive UAT ledger.

**Final counts:** 2,314 descriptors; 1,267 executable T1-ready rows; 556 guarded fail-closed rows; 5 bridge-needed rows; 141 UAT-needed rows; 123 blocked rows; 222 degraded/discovery-pending rows.

**Accepted closeout caveats:** v1.1.0 does not claim all apps are T1-ready. Remaining rows are non-invocable until their documented proof requirements are satisfied. Backlog side phase `999.1 MCP tool gaps -- click heuristics` remains outside the milestone.

## Last Milestone: v1.0.0 Full App Catalog (OpenTabs Parity)

**Status:** Archived on 2026-06-29. Audit passed; automated milestone gate met. Archive files live under `.planning/milestones/v1.0.0-*`.

**Outcome:** FSB imported the full allowed OpenTabs-derived catalog surface into existing capability tiers: 2,314 descriptors across 128 app stems / 129 services, with side-effect classification, backing-status annotation, denylist/sensitive-origin gating, discovery seeding, scale gates, and selected T1 heads. The milestone deliberately did not hand-port every descriptor; that T1 expansion debt is now the explicit v1.1.0 milestone.

## Last Milestone: v0.9.99 Native Capability Catalog (FSB API Execution)

**Goal:** Give FSB first-class authenticated-API execution as a fast path alongside DOM automation -- match OpenTabs' "call APIs through your authenticated session" capability with zero plugin installs and no MCP tool bloat, backed by FSB's DOM engine as a self-healing fallback.

**Target features:**
- Lean dispatcher surface: keep the existing ~63 MCP tools byte-stable; add a small handful (e.g. `search_capabilities` + `invoke_capability`) using progressive disclosure (search -> invoke) so the catalog never bloats the MCP context.
- Capability runtime in the extension: authenticated same-origin fetch primitive (FSB already holds `debugger` + `<all_urls>` + `execute_js`) plus a fixed bundled interpreter that executes capability definitions.
- MV3-safe code/data split: bundled imperative handlers compiled into the extension for the hard/popular head; server-delivered DECLARATIVE recipes (data, not code -- MV3 prohibits remotely-hosted code) interpreted locally for the easy long tail.
- Network-capture discovery: use the existing CDP/`debugger` permission to observe a page's real API calls (endpoint, auth, headers, payload) to learn capabilities.
- Learned recipes via memory: promote successful calls into FSB procedural memory as reusable per-origin recipes that auto-grow the catalog.
- Self-healing fallback: when a recipe breaks, drop to DOM automation and still complete the task.
- Consent governance: per-origin Off/Ask/Auto gating + audit log + default-off for authenticated API replay (FSB stays supervised/safe).
- Out-of-box + optional install: popular capabilities ship bundled; long tail streams from FSB's server; optional explicit install via MCP command or control panel.

**Key context:**
- Carry hard invariants: INV-01 MCP wire contracts untouched, INV-02 autopilot/MCP tool-surface parity, INV-03 parity across all 7 providers, INV-04 MV3-survivability preserved.
- Content strategy = port + learn, NOT re-derive ~2,769 service tools from scratch; do not clone OpenTabs' npm-per-plugin model.
- DOM automation + site guides remain as the universal fallback -- not removed.

## Last Milestone: v0.12.0 PhantomStream Package Migration

**Status:** Completed on 2026-06-17. Automated gates passed; live Chrome-extension UAT remains `human_needed`.

**Outcome:** FSB replaced duplicate in-house generic DOM stream engines with the pinned PhantomStream package. The content-side capture adapter, shared static/Angular dashboard viewer wrapper, service-worker protocol bridge, server relay compatibility adapter, and remote-control mapping now preserve FSB product behavior while delegating generic browser mirroring to PhantomStream.

**Architecture notes:**
- Installed package: `@full-self-browsing/phantom-stream@0.1.0` from npm. Verified exports include `./protocol`, `./capture`, `./renderer`, `./relay`, `./transport/websocket`, and adapters listed in `.planning/phases/21-package-intake-contract-mapping/21-PACKAGE-SURFACE.md`.
- Rejected package: `@fullselfbrowsing/phantom-stream` returned `E404` on 2026-06-17. Do not use it in active docs or code except to explain the correction.
- FSB has two dashboard surfaces (`showcase/js/dashboard.js` and Angular dashboard). Both consume the shared `window.FSBPhantomStreamViewer` wrapper to prevent renderer drift.

## Last Milestone: v0.11.0 Trigger Tool (Reactive DOM Monitoring)

**Status:** Completed on 2026-06-17. Release actions and live-browser/composed trigger UAT remain user-gated.

**Outcome:** FSB gained a storage-backed trigger tool family across autopilot and MCP: `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers`; live-observe and refresh-poll watch modes; fire-condition/value-extraction logic; blocking/detached reporting; trigger-cap UI; conflict/reload coalescing; and documentation. All 39 v1 requirements were mapped and completed across Phases 14-20, with browser UAT debt recorded rather than fabricated.

## Last Milestone: v0.10.0 Autopilot via Lattice SDK

**Status:** Shipped and archived on 2026-06-15. FSB no longer depends on the gitignored local `./lattice` checkout for runtime consumption. The active dependency is the public npm package `@full-self-browsing/lattice@1.3.0`, installed under the existing `lattice` import alias, with `@full-self-browsing/lattice-cli@1.3.0` added for receipt verification workflows. The package requires Node `>=24`, so the root `engines.node` floor is now `>=24.0.0`. `.planning/LATTICE-PIN.md` is now a package pin as well as source-tag audit trail: source tag `v1.3.0`, tag commit `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`, package integrity `sha512-w7cm8b+FFLcN9e1kRWDL0LaDZunAdMhlBFOrsIrryYV5cQifBKfjd0mlStYqwaHYhgm1TQvyw8BIac0lN4JszA==`.

**Goal:** Keep FSB's production import surface stable (`import ... from "lattice"`) while replacing the local clone dependency with the stable public Lattice package available today. The milestone now validates the package boundary directly: package metadata, lockfile integrity, public runtime exports, CLI availability, receipt schema `lattice-receipt/v1.2`, provider factories, checkpoint hooks, survivability adapter, bridge wiring, and the existing offscreen bundle path.

**Why this matters (vs attempt-1):** v0.10.0-attempt-1 invented hook + receipt + step-marker + resumption primitives inside FSB and planned to port them to Lattice later via separate PRs (LAT-05 only IDENTIFIED port candidates). That created duplication risk (FSB's checkpoint-hook + Lattice's signed-receipt are conceptually the same shape but live in two repos) and deferred Lattice round-trip validation. Attempt-2 inverts: Lattice owns the primitives, FSB consumes; the Lattice round-trip happens continuously.

**Lattice integration model:**
- FSB consumes Lattice through package.json alias `"lattice": "npm:@full-self-browsing/lattice@1.3.0"`.
- FSB pins the public CLI as dev tooling: `"@full-self-browsing/lattice-cli": "1.3.0"`.
- `package-lock.json` must resolve `node_modules/lattice` to `@full-self-browsing/lattice@1.3.0` with the registry integrity recorded in `.planning/LATTICE-PIN.md`.
- Runtime code keeps the bare `lattice` specifier; esbuild still bundles the offscreen host from that alias.
- Historical Phase 1-12 references to `./lattice` remain audit history, but active verification no longer requires a local Lattice checkout.

**Lattice SDK extension candidates (to be scoped during phase discussion):**
- Receipt-shaped state envelopes for any agent-loop runtime (not just Lattice's own server-side runtime); MV3-survivable encoding
- Tripwire / hook primitive with priority bands (SAFETY > OBSERVABILITY > EXTENSION) + matcher regex + race-with-log per-handler budget + frozen contexts + mid-session registration freeze
- Universal-provider adapters for the 7 FSB providers (Anthropic, OpenAI, xAI, Gemini, LM Studio, OpenRouter, custom OpenAI-compatible)
- Task-delegation primitive (parent-child loops with summary-return + cache-prefix sharing + rate-limit-group coordination) -- pending Lattice-policy discussion on multi-agent scope
- MV3-survivability adapter contract (Lattice has no existing concept; FSB may be the first runtime with this constraint)
- Observability / step-marker primitive

**Hard invariants (non-negotiable, carried over from attempt-1):**
- **INV-01 MCP wire contracts UNTOUCHED.** Tool schemas, semantics, request/response shapes of every existing MCP-exposed tool stay byte-identical.
- **INV-02 Tool surface parity.** FSB's autopilot loop uses the SAME tool registry that MCP exposes. No parallel "autopilot-only" tool stack.
- **INV-03 Provider parity.** Every improvement works equally across all 7 `universal-provider.js` targets.
- **INV-04 MV3-survivability preserved.** The existing `setTimeout`-chained iterator pattern at `agent-loop.js:1824/2418/2487/2497` is load-bearing. Lattice integration is additive runtime adaptation, NOT iterator replacement.
- **INV-05 No resurrection of deprecated modules.** `extension/agents/agent-executor.js` / `agent-manager.js` / `agent-scheduler.js` stay frozen.
- **INV-06 (UPDATED) Public Lattice package stays pinned and audited.** FSB consumes Lattice through the public npm package alias, and `.planning/LATTICE-PIN.md` + `package-lock.json` + `tests/lattice-public-package.test.js` must agree on package name, version, integrity, source tag, and source SHA. FSB-side code remains integration glue and does not re-implement primitives that belong in Lattice.

**Parallel work on `main` (this branch diverges):** v0.9.70 Showcase Dashboard Reliability (streaming fix, Sync-tab restore, 16:10 viewport) continues on `main` and is NOT this milestone's work. Merge reconciliation between branches deferred until both ship.

**Reference frameworks (patterns only, not dependencies):** Lattice (the SDK FSB is integrating with); Claude Agent SDK hooks (vocabulary baseline); LangGraph (state-graph carve-out vocabulary).

**Other deferred candidates (not in this milestone):**
- Skills primitive (full domain-specific tool+prompt loading) -- moved to v0.11.0+ per PITFALLS (MCP wire-contract drift, site-matcher security, mid-session hook registration vs. freeze).
- Receipt signing (Ed25519 + RFC 8785 JCS) -- already exists in Lattice's v1.1 Capability Receipts; FSB integration may unlock signing for free.
- Lattice contribution PRs (FSB-driven SDK additions ported to Lattice mainline) -- happens AFTER FSB integration validates the additions; lands in Lattice repo as separate milestones.
- Public benchmark publication (WebArena / WebVoyager / Mind2Web).
- All carry-forward backlog from v0.9.69 (telemetry follow-up surface, v0.9.64 picker-cookie, v0.9.65 dashboard i18n).

## Previous Milestone: v0.10.0-attempt-1 (FSB-first, abandoned 2026-05-24)

**Status:** Pivoted before milestone completion. Phases 1-2 shipped FSB-side code (hooks-foundation + state-inspectability-carve-out, 617/617 tests green) before the team re-evaluated and chose to pivot to the Lattice-first approach. All work preserved on `pre-pivot-archive/v0.10.0-fsb-first` branch and under `.planning/milestones/v0.10.0-attempt-1-pre-pivot/` on disk.

**Recoverable artifacts from attempt-1:** Phase 1 hook-pipeline extensions (priority bands, matcher, race-with-log, freeze, lockBand, 5 new lifecycle events, 4 hook factories including loop-detection + telemetry); Phase 2 LIFECYCLE_EVENTS.STEP_TRANSITION + checkpoint-hook.js + 12 step markers in runAgentIteration + additive persistSession schema + sidepanel Agent State Inspector UI + full MV3 SW eviction resumption with CONSERVATIVE recovery (ON_ERROR for mid-API-request, RECOVERY_AMBIGUOUS for mid-tool-dispatch, SAFE replay for boundary states). The patterns themselves are intellectually correct; in attempt-2 they live in Lattice instead of FSB.

**Next milestone candidates (deferred to a future cycle):**
- **v0.9.70 (telemetry follow-up)** -- first-run banner, "View what we send" preview, "Reset anonymous ID" button, in-extension "Wipe my data" UI, region-gated opt-IN for EU/UK/CA.
- **v0.9.70 (streaming)** -- full dashboard streaming rewrite if STREAM-07 5-attempt cap is hit during Phase 276 browser repro.
- **v0.9.64 (UX, carry-forward)** -- picker-cookie short-circuit on bare-`/` Accept-Language redirect.
- **v0.9.65 (dashboard i18n, carry-forward)** -- translate `showcase/angular/src/app/pages/dashboard/**`.

## Previous Milestone: v0.9.69 Anonymous Telemetry Pipeline + Showcase Dashboard Streaming Fix (shipped 2026-05-14)

**Goal:** Stand up a privacy-preserving telemetry pipeline that flows MCP and extension usage metrics from end-user installs into the FSB server (`showcase/server/`), render those aggregates on the public `/stats` Easter-egg page, and restore the broken DOM streaming in the showcase dashboard.

**Target features:**
- MCP request logging in the extension control panel: cost + token tracking + per-call log rows alongside the existing AI-provider analytics hero.
- API pricing module: hardcoded `MODEL_PRICING` table with per-MCP-client default-model assumptions (Claude Code -> Sonnet 4.6, Codex -> GPT-5, etc.), researched live for 2026 rates, source-stamped, updateable by version bump.
- Anonymous telemetry collector in the extension: install-time UUIDv4 in `chrome.storage.local`; batched periodic beats; strictly allowlisted payload (UUID, tokens used, active-agent count, MCP client label, model). Opt-out toggle + first-run privacy banner.
- Telemetry ingestion on `showcase/server/`: new `/api/telemetry/*` routes; server hashes IP as `SHA-256(IP + daily salt)` so plaintext IP is never persisted; new SQLite tables for events + per-UUID rollups.
- Aggregation queries: total tokens, active users right now, total users, active agents, total agents lifetime, most-popular agent, most-popular MCP, avg agents per user.
- Stats page (`/stats`) extended with a "FSB Telemetry" toggle group surfacing the aggregates, reusing the existing 5-min visibility-aware polling primitive.
- Showcase dashboard DOM-streaming fix: diagnose and repair the WS `dash:dom-stream-*` pipeline between extension and dashboard preview pane (last phase).

**Key constraints:**
- Anonymous identity only -- UUIDv4 per install, NO PII, ever. Plaintext IP never persisted (hashed server-side with daily salt).
- Opt-out consent, on by default, visible toggle in control panel + first-run privacy banner.
- Server side extends existing `showcase/server/` (Express + SQLite); NO new microservice.
- Build order: telemetry pipeline first (extension logging -> pricing -> collector -> ingest -> aggregates -> stats page); dashboard streaming fix LAST.
- The `/stats` Easter-egg page from quick task 260514-1nv (on `Refinements`) is the consumption surface for the new aggregates.

**Carry-forward backlog still pending (NOT in this milestone):**
- v0.9.64-equivalent UX -- WARNING-02 picker-cookie short-circuit on bare-`/` Accept-Language redirect.
- v0.9.65-equivalent i18n -- dashboard surface i18n; `--ignore-pattern src/app/pages/dashboard/**` in `lint:i18n` carries forward.

## Previous Milestone: v0.9.63 Showcase i18n (shipped 2026-05-13)

**Goal:** Translate the FSB marketing site into es / de / ja / zh-CN / zh-TW with English as source-of-truth, CI-gated drift detection, per-locale prerendered HTML with hreflang + canonical fan-out, AI-filled XLIFFs, and Accept-Language auto-detection.

**Shipped:** 7 phases (261, 262, 264, 265, 266, 267, 268), 15 plans, 14/14 v0.9.63 requirements satisfied, audit `passed`. 420 trans-units across 7 namespaces; 30 prerendered HTMLs; hard-fail CI gates (`lint:i18n`, `extract-i18n-clean`, `verify-locale-sync`, `verify:hreflang`); `i18nMissingTranslation: error`; Accept-Language middleware on `/` (BCP-47, cookie-respecting, bot-safe). Phase 268 closed audit warnings WARNING-01 (server.js locale-list dedup) and WARNING-03 (retroactive `VERIFICATION.md` backfill).

**Archive:** [.planning/milestones/v0.9.63-ROADMAP.md](milestones/v0.9.63-ROADMAP.md), [.planning/milestones/v0.9.63-REQUIREMENTS.md](milestones/v0.9.63-REQUIREMENTS.md), [.planning/milestones/v0.9.63-MILESTONE-AUDIT.md](milestones/v0.9.63-MILESTONE-AUDIT.md).

**Accepted closeout caveats:** WARNING-02 (picker-cookie short-circuits bare-`/` redirect for returning fresh-tab visitors) deferred per 267-CONTEXT D-02 / T-267-03 -- candidate for v0.9.64+ UX revisit. Dashboard surface untranslated, deferred to v0.9.65 (`--ignore-pattern` in `lint:i18n` carries forward). `feat/showcase-i18n` branch merge and `v0.9.63` tag push remain user-gated.

**Branch:** `feat/showcase-i18n`

## Previous Milestone: v0.9.62 Implicit Visual Session Contract (shipped 2026-05-11)

**Goal:** Make the MCP visual-session signal implicit on every action tool call so external agents stop missing it, replacing the explicit start/end tools with a required field + sliding-window timeout + explicit task-complete signal.

**Shipped:** 7 phases (254-260), 15 plans, 27/27 v1 requirements satisfied, audit `passed`. Implicit field bundle on 36 action tools; 15 read-only tool schemas locked; sliding 60s lifecycle with SW-eviction replay; `is_final` immediate clear; `TOOL_REMOVED` typed-rejection stubs for the old explicit tools; `fsb-mcp-server@0.9.0` in-tree; CHANGELOG + mcp/README + FSB Skill USAGE banners; contract / schema-lock / lifecycle tests wired into `ci / all-green`.

**Archive:** [.planning/milestones/v0.9.62-ROADMAP.md](milestones/v0.9.62-ROADMAP.md), [.planning/milestones/v0.9.62-REQUIREMENTS.md](milestones/v0.9.62-REQUIREMENTS.md), [.planning/milestones/v0.9.62-MILESTONE-AUDIT.md](milestones/v0.9.62-MILESTONE-AUDIT.md).

**Accepted closeout caveats:** `npm publish fsb-mcp-server@0.9.0` user-gated post-merge. `skills/FSB Skill/references/multi-agent-contract.md` line 29 carries an in-passing contextual reference to `start_visual_session` in a NO_OWNED_TAB recovery example (not instructional; flagged for v0.9.63 polish). `mcp/build/install.js` carries pre-existing local modifications unrelated to v0.9.62 (logged in Phase 258 deferred-items).

**Branch:** `refinements`

## Previous Milestone: v0.9.61 FSB Skill (OpenClaw) (shipped 2026-05-08)

**Goal:** Ship an OpenClaw skill that installs `fsb-mcp-server`, walks the user through FSB Chrome extension install, and defaults web-automation requests to FSB.

**Target features:**
- OpenClaw skill package at `<workspace>/skills/FSB Skill/` with `name: FSB` in SKILL.md frontmatter, organized SKILL.md + USAGE.md + references/ + scripts/
- First-run setup flow that runs `fsb-mcp-server doctor`, branches on the failing layer (package/bridge/extension/active-tab/content-script/config), and prints the OpenClaw stdio config block (since `--openclaw` install is officially "manual / unsupported" per `mcp/src/install.ts:413-420`)
- Optional auto-install of FSB MCP for other detected MCP hosts on the same machine (Claude Desktop, Cursor, Codex, etc.) via existing `npx -y fsb-mcp-server install --<host>` flags
- Chrome extension install guide pointing at `https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk`
- USAGE.md user-facing one-pager: 3-step install, "try it" prompts, `doctor` recovery recipe
- Decision-tree reference teaching FSB tool selection: read-only first (`read_page` → `get_dom_snapshot` → `get_page_snapshot`), `get_site_guide` for known sites, typed events over `.value`, `run_task` only when user explicitly delegates to FSB autopilot
- Visual-session wrapping with `client="OpenClaw"` for any external-AI-driven sequence
- Multi-agent contract documentation: callers must not pass `agent_id`; surface and explain typed errors `TAB_NOT_OWNED`, `AGENT_CAP_REACHED`, `TAB_INCOGNITO_NOT_SUPPORTED`, `TAB_OUT_OF_SCOPE`; use `back` tool instead of `execute_js("history.back()")`
- Vault boundary policy: route credentials through `fill_credential` / `use_payment_method`; no secrets in chat
- Default-to-FSB rule: soft preference for FSB tools when one fits; hard escalation for any click/type/auth/multi-tab task
- Restricted-tab recovery playbook (`list_tabs`, `navigate`, `open_tab`, `switch_tab`, `go_back`, `go_forward`, `refresh`)
- OpenClaw skill spec verification: confirm exact schema of `metadata.openclaw.install[]`, `requires.bins` accepted values, and `command-arg-mode` behavior against a live OpenClaw build before finalizing SKILL.md frontmatter

**Branch:** `Claw`

## Previous Milestone: v0.9.60 Multi-Agent Tab Concurrency (MCP 0.8.0) (shipped 2026-05-08)

**Shipped:** 11 phases (237-247), 30 plans, 42/42 requirements traced. MCP agent identity + tab ownership with typed `TAB_NOT_OWNED` rejection, configurable concurrency cap (1-64, default 8) with `AGENT_CAP_REACHED`, forced-new-tab pooling, `connection_id`-keyed reconnect grace, ownership-gated `back` MCP tool, `run_task` lifecycle return-on-completion (Phase 236 reborn) with 30s heartbeats and SW-eviction `partial_state`, post-action `change_report`, agent-scoped tab resolution (no focus-stealing on background tabs), and bootstrap-safe recovery from restricted active tabs (`chrome://newtab/`). `fsb-mcp-server@0.8.0` is tag-ready.

**Archive:** [.planning/milestones/v0.9.60-ROADMAP.md](milestones/v0.9.60-ROADMAP.md), [.planning/milestones/v0.9.60-REQUIREMENTS.md](milestones/v0.9.60-REQUIREMENTS.md), [.planning/milestones/v0.9.60-MILESTONE-AUDIT.md](milestones/v0.9.60-MILESTONE-AUDIT.md).

**Accepted closeout caveats:** `npm publish fsb-mcp-server@0.8.0` is user-gated; live `switch_tab` unowned-target branch covered only by automated dispatcher tests (browser auto-owned candidate tabs as `legacy:sidepanel`); 5-run long `run_task` soak deferred (automated lifecycle coverage green).

## Future Milestone Candidates (deferred)

Carry-forward backlog candidates:

- **GEO content pack**: FAQ page + `FAQPage` JSON-LD (DISCO-FUTURE-01); comparison pages (`/vs-browser-use`, `/vs-project-mariner`, `/vs-stagehand`, `/vs-browseros`) (DISCO-FUTURE-02); per-route OG images (CRAWL-FUTURE-01)
- **Off-page launch**: Show HN, Reddit launches, awesome-list PRs, demo video (DISCO-FUTURE-04); Search Console + Bing Webmaster Tools registration + monitoring (DISCO-FUTURE-05)
- **Zoneless change detection migration** (now unblocked post-A20 upgrade)
- **Splitting `tests/` per package** (currently shared at repo root)
- **Cleanup `serve:ssr:showcase-angular` dead npm script** (Angular 20 doesn't emit `dist/showcase-angular/server/`)

<details>
<summary>Previous milestones (collapsed)</summary>

### v0.9.46 Site Discoverability (SEO + GEO) — Shipped 2026-05-02

**Goal:** Make `full-selfbrowsing.com` discoverable to traditional search engines and generative AI search by prerendering the Angular SPA marketing routes and shipping LLM/crawler-aware root files.

**Outcome:** All 24 v1 requirements satisfied (22 automated + 2 live-verified post-deploy). Static prerender of `/`, `/about`, `/privacy`, `/support`; per-route metadata + canonicals; Organization + SoftwareApplication JSON-LD; robots.txt with 15 named LLM bot allowlists; sitemap.xml, llms.txt, llms-full.txt; Express SPA-fallback patched. Archive at `.planning/milestones/v0.9.46-ROADMAP.md`.

</details>

## Previous Milestone: v0.9.45rc1 Sync Surface, Agent Sunset & Stream Reliability

**Goal:** Refocus FSB on what it does best -- ship a dedicated Sync tab for remote control, gracefully retire background agents in favor of OpenClaw / Claude Routines, and harden the streaming pipeline the dashboard relies on.

**Already landed (counted toward this milestone):**
- Phase 209 -- Remote control handlers (CDP click/key/scroll, lifecycle broadcast)
- Phase 210 -- QR code pairing restoration (60s server-driven countdown, regenerate-on-expiry)
- Phase 211 -- Stream reliability & diagnostic logging (LZ decompression, two-tier watchdog, redacted rate-limited warns)
- Phase 212 -- Background agents sunset (deprecation card + sunset notice + showcase mirror; comment-out, not delete)

**Target features:**
- Sunset background agents with a playful deprecation card in the FSB control panel pointing at OpenClaw and Claude Routines
- Carefully comment out (not delete) background-agent-only code paths, preserving shared utilities, annotated with deprecation reason
- Mirror agent-sunset messaging across the showcase/dashboard surfaces
- New top-level Sync tab in the control panel -- single purpose: remote control / pairing / dashboard handshake (relocates Phase 209 + 210 UI)
- Update showcase/dashboard navigation/copy to point at the same Sync surface
- Harden DOM streaming: mutation queue watchdog, large-DOM truncation performance, stale mutation counter reset
- Fix asymmetric WebSocket compression (add decompression for incoming messages)
- Replace silent error swallowing with diagnostic logging in dialog relay and message delivery

## Previous Milestone: v0.9.40 Session Lifecycle Reliability (shipped 2026-04-25)

**Shipped:** Fixed silent task abandonment across all agent loop exit paths, background session lifecycle hardening (stale cleanup, tab close, SW wake), diagnostic logging for message delivery failures, and sidepanel orphan recovery. 3 phases, 4 plans, 12 commits.

## Previous State: v0.9.36 MCP Visual Lifecycle & Client Identity (shipped 2026-04-24)

**Archive:** See `.planning/milestones/v0.9.36-ROADMAP.md`, `.planning/milestones/v0.9.36-REQUIREMENTS.md`, and `.planning/MILESTONES.md`.

**Accepted closeout note:** No standalone `v0.9.36-MILESTONE-AUDIT.md` file was created before archive; closeout relies on the archived roadmap snapshot, requirements snapshot, and phase summaries.

## Previous State: v0.9.35 MCP Plug-and-Play Reliability (shipped 2026-04-24)

**Shipped:** MCP bridge lifecycle repair, explicit MCP routing contracts, layer-aware diagnostics, installer/config parity across supported hosts, and release smoke/UAT hardening for the FSB MCP surface.

**Archive:** See `.planning/milestones/v0.9.35-ROADMAP.md`, `.planning/milestones/v0.9.35-REQUIREMENTS.md`, and `.planning/MILESTONES.md`.

**Accepted closeout debt:** No standalone `v0.9.35` milestone-audit file was created before archive, and Phase 202 records residual live-UAT risk because paid-model host prompt runs were not auto-triggered when local host preflight was already red or unconfigured.

## Previous State: v0.9.33 Dashboard Task Results & Stream Quality (shipped 2026-04-20)

**Shipped:** Canonical dashboard surface, task lifecycle bridge, DOM stream forwarding, dashboard result UI (result cards, action feed, AI summary), stream quality & resilience. 5 phases, 6 plans.

## Requirements

### Validated

- ✓ Chrome Extension MV3 architecture with service worker -- existing
- ✓ Multi-provider AI integration (xAI, OpenAI, Anthropic, Gemini) -- existing
- ✓ DOM analysis and element identification -- existing
- ✓ Action execution toolset (25+ browser actions) -- existing
- ✓ Session management with state tracking -- existing
- ✓ Stuck detection and recovery mechanisms -- existing
- ✓ Multi-UI (popup chat, sidepanel, options dashboard) -- existing
- ✓ Analytics and usage tracking -- existing
- ✓ Secure API key storage with encryption -- existing
- ✓ Conversation history for multi-turn tasks -- existing
- ✓ Shared UI baseline across popup, sidepanel, control panel, and dashboard surfaces -- v0.9.21
- ✓ Retouched sidepanel and popup operator surfaces with cleaner hierarchy and state feedback -- v0.9.21
- ✓ Control panel/dashboard polish with flatter dark shell, tighter density, and cleaner utility chrome -- v0.9.21
- ✓ Context-aware overlay feedback for text/link targets versus larger controls -- v0.9.21
- ✓ MCP server published to npm with `npx -y fsb-mcp-server`, optional local HTTP mode, and install diagnostics -- v0.9.8.1
- ✓ Precise element targeting with uniqueness-scored selectors -- v0.9
- ✓ Visual feedback with orange glow highlighting -- v0.9
- ✓ Fast execution with outcome-based dynamic delays -- v0.9
- ✓ Reliable selectors with coordinate fallback -- v0.9
- ✓ Quality context (3-stage filtering, 50 elements, semantic descriptions) -- v0.9
- ✓ Action verification with state capture and effect validation -- v0.9
- ✓ Debugging infrastructure (action recording, inspector, replay, export) -- v0.9
- ✓ Content script modularization (10 modules with dependency ordering) -- v9.3
- ✓ Configurable ElementCache with live storage updates -- v9.3
- ✓ AI memory extraction with correct provider instantiation -- v9.3
- ✓ AI enrichment for all memory types (episodic/semantic/procedural) -- v9.3
- ✓ Cross-site pattern learning from sitemaps -- v9.3
- ✓ Memory detail panels with type-specific renderers -- v9.3
- ✓ Memory cost tracking (dashboard + Memory tab) -- v9.3
- ✓ Per-site guide files (43 sites, 9 categories) -- v9.3
- ✓ Session log parsing into site guides with confidence scoring -- v9.4
- ✓ ATS base guides (Workday, Greenhouse, Lever, iCIMS, Taleo) -- v9.4
- ✓ Single-company career search with error reporting -- v9.4
- ✓ Multi-site sequential search with data persistence -- v9.4
- ✓ Google Sheets data entry via Name Box pattern -- v9.4
- ✓ Google Sheets formatting (headers, freeze, auto-size) -- v9.4
- ✓ Batch action execution with DOM completion detection -- v9.4
- ✓ Timezone/country locale injection for AI decisions -- v9.4
- ✓ CLI command protocol replacing JSON tool calls -- v10.0
- ✓ Unified markdown DOM snapshot with element refs -- v10.0
- ✓ Full prompt architecture rewrite for CLI grammar -- v10.0
- ✓ Multi-signal completion validator with task-type awareness -- v10.0
- ✓ Google Sheets multi-strategy selector resilience -- v10.0
- ✓ Page text extraction via readpage CLI command -- v10.0
- ✓ Site intelligence for 7 productivity apps (Notion, Calendar, Trello, Keep, Todoist, Airtable, Jira) -- v0.9.2
- ✓ Generalized fsbElements injection pipeline with keyword routing -- v0.9.2
- ✓ Unified Task Memory schema (one consolidated report per session) -- v0.9.3
- ✓ Task Memory display with collapsible recon report, per-task graph, knowledge graph integration -- v0.9.3
- ✓ Memory export/import with duplicate detection -- v0.9.3
- ✓ Scroll-aware DOM snapshots with viewport-complete element inclusion -- v0.9.4
- ✓ 8-point action diagnostics with natural language suggestions -- v0.9.4
- ✓ Observation-based stability detection replacing hardcoded delays -- v0.9.4
- ✓ Parallel heuristic + AI debug fallback on every failure -- v0.9.4
- ✓ Progress overlay text sanitization with markdown stripping -- v0.9.5
- ✓ Debug intelligence pipeline (diagnosis + suggestions in AI continuation prompt) -- v0.9.5
- ✓ Phase-weighted progress model with task phase detection -- v0.9.5
- ✓ Complexity-aware ETA blending from task estimator -- v0.9.5
- ✓ Multi-site and Sheets workflow-specific progress tracking -- v0.9.5
- ✓ AI-generated live action summaries with cache and timeout -- v0.9.5
- ✓ Overlay UX polish (task summary line, recovery state, phase debounce) -- v0.9.5
- ✓ 50 MCP edge case prompts validated across canvas, micro-interaction, scroll, context, and dark pattern categories -- v0.9.7
- ✓ 6 new CDP tools (scroll_at, click_and_hold, drag_drop, select_text_range, drop_file, drag_variable_speed) -- v0.9.7
- ✓ 30+ site guides created/updated with real-world automation intelligence -- v0.9.7
- ✓ 50 autopilot diagnostic reports with 500+ recommendations catalogued -- v0.9.7
- ✓ Autopilot CLI command table, parser registry, and isValidTool validator include all 7 CDP tools (cdpClickAt, cdpClickAndHold, cdpDrag, cdpDragVariableSpeed, cdpScrollAt, selectTextRange, dropfile) -- v0.9.8/P97
- ✓ Tool-aware system prompt with TOOL SELECTION GUIDE, canvas task type detection, PRIORITY TOOLS conditional injection, and text-selection/file-upload sub-pattern hints -- v0.9.8/P98
- ✓ 500+ v0.9.7 diagnostic recommendations embedded as prepended strategy hints in 49 site guide files across 5 categories (canvas, micro, scroll, context, dark) -- v0.9.8/P99
- ✓ Procedural memory extraction from successful sessions and RECOMMENDED APPROACH injection into autopilot prompts with per-domain cap of 5 -- v0.9.8/P100
- ✓ Refresh-poll trigger watch with 30s alarm floor, owned-tab background reload, typed missing/blocked attention states, lifecycle-seam evaluation, and pulse reassertion -- v0.11.0 Phase 17
- ✓ Autonomous memory intelligence: auto-consolidation (10-session/80% triggers), cross-domain strategy transfer with taskType matching, domain-change memory refresh, dead episodic code removed -- v0.9.8/P101
- ✓ Robustness hardening: viewport bounds validation for CDP tools, bidirectional stuck recovery, 3-stage progressive prompt trimming, 2-stage CLI parse retry with simplified hint -- v0.9.8/P102
- ✓ Validation test harness with 50 autopilot-adapted edge case prompts, results tracking, and milestone gate metrics (VALID-02/03/04) -- v0.9.8/P103 (harness built, manual execution pending)
- ✓ Verification mechanics fix: CDP direct routing bypasses broken round-trip, dynamic-page completion fast-path, 5-minute session inactivity timeout -- v0.9.8/P104

- ✓ Full Excalidraw mastery: text entry (inserttext + dblclickat), all drawing primitives, styling, connectors, alignment, export, NL diagram generation -- v0.9.9
- ✓ Universal Canvas Vision: draw call interception via Canvas2D prototype proxy, structured CANVAS SCENE in DOM snapshots, pixel fallback, 12/15 canvas apps covered -- v0.9.9/P115
- ✓ 9 systemic fixes: inserttext CLI command, batch CDP routing, debugger contention, guidance truncation 500->3000, fast-path threshold 3->6 for editors -- v0.9.9

- ✓ Site-aware search tool (use site's own search input, not Google redirect) -- v0.9.11
- ✓ read_page auto-stability (merge wait_for_stable into read_page for JS-heavy sites) -- v0.9.11
- ✓ BF cache resilience for click (re-inject content script after page transitions) -- v0.9.11
- ✓ Viewport-aware click/hover (fix scrollIntoView for off-screen elements) -- v0.9.11
- ✓ Smart press_enter fallback (auto-click submit button when Enter fails) -- v0.9.11
- ✓ Intelligent content truncation (cap read_page, prioritize main content) -- v0.9.11
- ✓ Cookie consent auto-dismiss (clear overlays blocking interaction) -- v0.9.11

- ✓ State foundation: typed session schema (57 fields, hot/warm tiers), transcript store with FSB compaction, structured turn results, action history with replay/diff, state event emitter -- v0.9.24/P156

- ✓ Engine configuration: cost tracker extraction (MODEL_PRICING + CostTracker), engine config (SESSION_DEFAULTS + EXECUTION_MODES), permission context stub -- v0.9.24/P157

- ✓ Hook pipeline: HookPipeline class (7 lifecycle events), safety breaker wrappers, permission pre-check hook, 4 progress hook factories -- v0.9.24/P158

- ✓ Agent loop refactor: wired 11 modules into agent-loop.js (10 hook emissions, module delegation), background.js hook factory + auto-resumption from warm state -- v0.9.24/P159
- ✓ Bootstrap pipeline: ordered service-worker startup with deferred non-essential initialization -- v0.9.24/P160
- ✓ Module adoption: createSession, CostTracker, TurnResult, ActionHistory, and mode-aware session persistence adopted across runtime entry points -- v0.9.24/P161
- ✓ Event bus wiring: SessionStateEmitter events now reach popup and sidepanel consumers -- v0.9.24/P162
- ✓ Partial outcome lifecycle: useful-but-blocked work now persists as a first-class partial result across runtime, MCP history, and UI surfaces -- v0.9.24/P162.1
- ✓ Auth wall handoff with result preservation: auth-blocked final steps now preserve completed work, explicit blocker details, and manual next steps -- v0.9.24/P162.2
- ✓ Overlay lifecycle reliability: canonical overlay replay, heartbeats, and dashboard resync keep debugger feedback alive across reconnects and long waits -- v0.9.24/P162.3
- ✓ Restricted-tab MCP parity: browser-safe tools now work from restricted pages, new-tab-only smart routing remains available, and blocked reads share actionable recovery guidance -- v0.9.25/P163
- ✓ Dashboard reliability rebaseline: preview, remote control, and task relay now use explicit recovery chips, authoritative remote-state handling, and run-bound reconnect recovery -- v0.9.25/P164
- ✓ Runtime carryover hardening: CostTracker now hydrates after final mode-aware safety config resolution, and the emitter/runtime contract no longer carries unused agent-loop passthrough or misleading dashboard delivery claims -- v0.9.25/P166
- ✓ Auth outcome smoke verification: preserved partial/manual handoff and same-session auth resume are now recorded as live-confirmed outcomes -- v0.9.25/P167

- ✓ Display firewall: developer noise (iteration counts, token usage, cost, model name) stripped from overlay, popup/sidepanel aligned to phase labels -- v0.9.26/P168
- ✓ GPU-composited scaleX() progress bar with zero layout reflows, actionCount data pipeline, tabular-nums on numeric displays -- v0.9.26/P169
- ✓ rAF-driven elapsed timer (M:SS), "Actions: N" counter, green completion state with Done pill and 3s auto-hide, reduced-motion compliance -- v0.9.26/P169
- ✓ CSS defensive hardening (overflow-wrap, flex-shrink, font/color inheritance cuts) for cross-site overlay resilience -- v0.9.26/P170
- ✓ First-sentence overlay text extraction and conversational prefix stripping for concise task summaries -- v0.9.26/P170
- ✓ Storage-backed dashboard analytics refresh, deferred off-screen refresh handling, null-safe dashboard labels, and regression coverage for the refresh contract -- v0.9.27/P171
- ✓ End-to-end local dashboard smoke verification proving real task completion updates metrics and chart data -- v0.9.27/P172
- ✓ Angular showcase shell introduced with canonical route parity, runtime asset parity, and persisted theme behavior contracts -- validated in Phase 173 (v0.9.29)
- ✓ Platform registry with 10 MCP platform configs, cross-OS path resolution, and format parsing dependencies -- v0.9.30
- ✓ Format-aware config read-merge-write engine (JSON/JSONC/TOML/YAML) with backup, idempotency, and error handling -- v0.9.30
- ✓ Install/uninstall CLI for all 10 MCP platforms with per-platform flags -- v0.9.30
- ✓ Claude Code CLI delegation, Codex TOML, Continue YAML support -- v0.9.30
- ✓ --dry-run preview and --all bulk install/uninstall across all platforms -- v0.9.30
- ✓ MCP bridge reconnects without extension reloads when the MCP host starts after Chrome, Chrome starts after the MCP host, or the MV3 service worker wakes from suspension -- Phase 198 (v0.9.35)
- ✓ MCP background/browser, autopilot, observability, and restricted-tab recovery tools route through explicit verified dispatcher contracts instead of fragile background self-dispatch -- Phase 199 (v0.9.35)
- ✓ MCP diagnostics now classify package/config/bridge/extension/content-script/tool-routing failures and guide operators through `doctor` and `status --watch` first -- Phase 200 (v0.9.35)
- ✓ Installer/config parity now covers Codex TOML preservation, Claude/Cursor/Windsurf variants, and explicit manual fallback posture for unstable hosts -- Phase 201 (v0.9.35)
- ✓ Release smoke now includes automated lifecycle/tool suites plus dated host evidence and diagnostics-first recovery docs -- Phase 202 (v0.9.35)
- ✓ MCP clients can start an explicit visual feedback session on a normal page without invoking FSB autopilot -- v0.9.36
- ✓ MCP visual sessions can report progress and end cleanly, with stale-session protection so the glow never gets stuck on the page -- v0.9.36
- ✓ Overlay and mirrored preview surfaces show a trusted badge for the active MCP client from an approved allowlist -- v0.9.36
- ✓ MCP docs and regression tests cover the start/progress/end contract and reject arbitrary badge labels -- v0.9.36

### Active

(Milestone v0.9.91 MCP Clients as Providers -- requirements and roadmap being defined; phases continue from v1.2.0's Phase 56 -> start at Phase 57. v1.2.0 Showcase i18n Completeness is archived; this milestone returns to the extension/MCP surface last touched in v0.9.99/v0.9.60-62.)

### Validated (v0.9.99)

- [x] CAP-01: A versioned closed-vocabulary recipe JSON Schema defines a recipe as pure data; out-of-vocabulary/forbidden (script/expr/transform/code/fn/js) fields are rejected with a typed RECIPE_* error -- Phase 26
- [x] CAP-02: The fixed bundled interpreter binds a validated recipe to a closed four-member auth-strategy enum and emits a bound request spec, never via eval/new Function/import(), and STOPS before any network call (the MAIN-world fetch is Phase 27) -- Phase 26
- [x] CAP-03: Recipes + invocation params are validated in the service worker by the eval-free `@cfworker/json-schema` validator; invalid/unknown-opcode input is rejected with a typed error (interpreter never throws, even on hostile `$ref` params) -- Phase 26
- [x] CAP-04: A Node CI guard (`scripts/verify-recipe-path-guard.mjs`, chained into `validate:extension` -> `ci/all-green`) fails the build on any eval/new Function/import( reachable from the six-file recipe-path allowlist, runs accept/reject fixtures, and self-asserts the three sanctioned `execute_js` sites are excluded; an allowlist-drift check forces new `capability-*.js` modules onto the list -- Phase 26
- [x] CAP-05: The interpreter + three vendored eval-free libraries (`@cfworker/json-schema` IIFE, `minisearch`, `jmespath`) ship inside the extension via additive `importScripts`, with no remotely-hosted code and no manifest/permission change -- Phase 26
- [x] SURF-01: `search_capabilities` returns ranked, schema-on-hit results (<=5) for an intent query, biased by the owned tab's origin resolved authoritatively SW-side -- Phase 28
- [x] SURF-02: `invoke_capability` executes a selected capability via the direct routerless path (slug -> `interpretRecipe` -> `executeBoundSpec`) with SW-side param validation and returns a structured result; unknown slug surfaces `RECIPE_NOT_FOUND` verbatim -- Phase 28
- [x] SURF-03: Both tools register OUTSIDE `TOOL_REGISTRY` via `server.tool()` (vault precedent), keeping the existing ~63 MCP tool schemas byte-identical -- INV-01 proven (frozen `EXPECTED_NON_TRIGGER_REGISTRY_HASH` unmoved; 65 tools on the wire = 63 + 2) -- Phase 28
- [x] SURF-04: A persisted `minisearch` index over a separate capability-descriptor doc (intent synonyms + service + action verb + side-effect class; the locked recipe schema untouched) snapshots to `chrome.storage.local` under `fsbCapabilityIndex` with a `catalogVersion` stamp; one shared `INDEX_OPTIONS` is reused at build and `loadJSON` -- Phase 28
- [x] SURF-05: `search_capabilities` is read-only and bypasses the mutation queue (joins `readOnlyTools`); `invoke_capability` is serialized through it -- Phase 28
- [x] SURF-06: An eval harness measures recall@k + wrong-invoke over a seeded near-neighbor fixture set and gates the build (recall@5=1.000, wrong-invoke=0; a naive index provably fails the gate). Live MCP-client end-to-end smoke recorded as `human_needed` UAT -- Phase 28

### Validated (v0.9.60)

- ✓ Per-session/task agent identity: MCP server mints `agent_<uuid>` IDs FSB-side via `crypto.randomUUID()`; one MCP client may run multiple parallel agents -- Phase 237 (AGENT-01..04)
- ✓ Tab ownership with typed `TAB_NOT_OWNED` rejection on cross-agent access; ownership tokens; incognito/cross-window rejected at dispatch boundary -- Phase 240 (OWN-01..05)
- ✓ Configurable concurrency cap (1-64, default 8) with fail-loud `AGENT_CAP_REACHED`; forced-new-tab pooling via `chrome.tabs.onCreated` + `openerTabId`; `connection_id`-keyed reconnect grace; pool-shrink release; no idle reaping -- Phase 241 (POOL-01..06, LOCK-01..04)
- ✓ Background-tab execution: action and read tools resolve target via agent registry, never `chrome.tabs.query({active:true})`; `open_tab` defaults to background; no focus-stealing on MCP-routed surfaces -- Phase 246
- ✓ Ownership-gated `back` MCP tool with structured `{status, resultingUrl, historyDepth}` results (`ok` / `no_history` / `cross_origin` / `bf_cache` / `fragment_only`) -- Phase 242 (BACK-01..05)
- ✓ MCP `run_task` returns on lifecycle completion with 30s `notifications/progress` heartbeats and SW-eviction `partial_state` envelope; 600s safety net -- Phase 239 (MCP-03..06)
- ✓ Agent-suffix MCP client badge, popup/sidepanel "owned by Agent X" chips, options.html Concurrency Cap control with active-agent context -- Phase 243 (BG-01..04, UI-01..03)
- ✓ Post-action `change_report` on every action tool (URL delta, added/removed/attr-changed nodes near action vicinity, dialogs, focus shift), size-capped with `truncated`, opt-out per-tool and global -- Phase 245 (CHANGE-01..05)
- ✓ Bootstrap-safe recovery from restricted active tabs: `open_tab`, zero-owned `navigate`, `switch_tab`, `list_tabs` work without content-script attachability; cross-agent owned tabs still rejected; protocol error labels accurate -- Phase 247
- ✓ `fsb-mcp-server@0.8.0` prepared with SDK `^1.29.0`, version metadata, README, CHANGELOG, multi-agent tool descriptions; tag-driven publish remains user-gated -- Phase 244 (MCP-01..02, MCP-07..08, TEST-01..05)

### Validated (v0.9.40)

- ✓ All agent loop exit paths (stuck force-stop, safety breakers, guard clauses) call finalizeSession() and notify the sidepanel -- Phase 206
- ✓ Every session termination records a structured outcomeDetails.reason (safety, stuck, orphan, tab-closed, etc.) -- Phase 206
- ✓ Stale session cleanup, tab close, and service worker wake handle running sessions without silent abandonment -- Phase 207
- ✓ Sidepanel detects orphaned "working" state and self-heals to idle -- Phase 208

### Validated (v0.9.45rc1, in-flight)

- ✓ Dashboard click/key/scroll commands reach the active streaming tab via Chrome DevTools Protocol with lifecycle state broadcast through ext:remote-control-state -- Phase 209 (live UAT pending)
- ✓ QR code pairing restored: #btnPairDashboard POSTs /api/pair/generate, renders QR with 60s server-driven countdown, regenerate-on-expiry affordance -- Phase 210
- ✓ WebSocket inbound `{_lz: true, d: <base64>}` envelopes decompress via `LZString.decompressFromBase64`; plain JSON falls through unchanged; failures recorded via `recordFSBTransportFailure('decompress-failed' | 'decompress-unavailable', ...)` -- Phase 211 (WS-01..03)
- ✓ DOM streaming hardened: two-tier watchdog (`chrome.alarms` SW-side + `setTimeout` 5s/500ms content-side), single TreeWalker pre-pass + cached rect map (1.67ms < 200ms on 5MB / 50k-node fixture), node-level truncation with `truncated: true, missingDescendants: N` sentinel, `staleFlushCount` field on `ext:stream-state` (`ext:dom-mutations` shape unchanged) -- Phase 211 (STREAM-01..04)
- ✓ Silent `.catch(() => {})` in dialog relay and message-delivery paths replaced with redacted, rate-limited diagnostic logging: `redactForLog` helper (origin/length/status only), `[FSB DLG]/[FSB BG]/[FSB WS]/[FSB DOM]` layered prefixes, 1 warn per (prefix, category) per 10s with counter rollup, 100-FIFO ring buffer in `chrome.storage.local.fsb_diagnostics_ring`, `chrome.runtime.onMessage` `exportDiagnostics` handler (Phase 213 wires the Sync tab button) -- Phase 211 (LOG-01..04)
- ✓ Background agents retired: permanent deprecation card in the FSB control panel (`<section id="background-agents">` body) names OpenClaw + Claude Routines as successors with `target="_blank" rel="noopener noreferrer"` CTAs; one-time `fsb_sunset_notice` names list reads `chrome.storage.local['bgAgents']` (defensive coercion accepts array AND object-map shapes) and renders names via `textContent` only; agent-only code commented per-line with canonical `// DEPRECATED v0.9.45rc1: superseded by OpenClaw / Claude Routines -- see PROJECT.md` annotation across `agents/*.js`, `mcp-server/src/tools/agents.ts` (no LIVE `server.tool()` calls; `registerAgentTools` shell preserved per D-16), `background.js` agent surfaces, `ws/ws-client.js` `dash:agent-run-now`, `ui/options.js` agent UI controllers, `/agent` slash commands; showcase home + both dashboards mirror the sunset; `MCP_RECONNECT_ALARM` early-return preserved byte-for-byte; `_lz` + `ext:remote-control-state` consumers preserved byte-for-byte; `bgAgents` storage and `fsb_agent_*` alarms preserved (no proactive cleanup); ROADMAP SC #3 clipboard export overridden via VERIFICATION.md `overrides:` block formally accepting D-11 -- Phase 212 (AGENTS-01..06)

### Deferred (MCP follow-up from v0.9.36)

- [ ] FSB derives trusted MCP client identity from connection or handshake metadata instead of requiring callers to send an allowlisted label each time.
- [ ] Approved MCP clients can opt into auto-wrapping manual browser tools in a visual session when visible feedback is desired.
- [ ] MCP visual sessions can be coordinated safely across multiple tabs or windows without badge/glow collisions.

### Deferred At v0.9.29 Close

- [ ] Dashboard session/auth, agent lifecycle management, and run-history views are ported to Angular with parity to the current experience.
- [ ] Task execution, live preview streaming, and remote-control state handling are ported to Angular with contract-safe behavior.
- [ ] Migration parity and regression checks are in place, including the deferred off-screen dashboard refresh smoke evidence before release tagging.

## Previous Milestone: v0.9.30 MCP Platform Install Flags (shipped 2026-04-18)

**Shipped:** Platform registry with 10 MCP platform configs, format-aware config engine (JSON/JSONC/TOML/YAML), install/uninstall CLI for all platforms, Claude Code CLI delegation, --dry-run preview, --all bulk operations. 3 phases, 6 plans.

## Previous Milestone: v0.9.29 Showcase Angular Migration (shipped 2026-04-15)

**Shipped:** Angular showcase shell route parity, persisted theme behavior, canonical clean-route server handling, legacy `.html` redirects. 1 phase, 7 plans, 14 tasks.

**Accepted gaps:** Phase 174-177 migration scope (`DASH-08` through `MIGR-03`) deferred.

## Previous Milestone: v0.9.27 Usage Dashboard Fix (shipped 2026-04-14)

**Shipped:** Storage-backed analytics refresh on `ANALYTICS_UPDATE`, deferred off-screen dashboard refresh handling, null-safe time-range label updates, reliable cost-breakdown rendering, regression coverage in `tests/dashboard-analytics-refresh.test.js`, and local end-to-end smoke verification that real task completion updates usage metrics and chart data. 2 phases, 3 plans, 7 requirements.

**Accepted debt:** `Off-Screen Dashboard Refresh Smoke` is still explicitly deferred for a final local rerun before any push or release tagging, and no standalone milestone-audit document was created for v0.9.27.

## Previous Milestone: v0.9.26 Progress Overlay Refinement (shipped 2026-04-12)

**Shipped:** Display firewall stripping developer noise, GPU-composited scaleX() progress bar, rAF-driven elapsed timer (M:SS), "Actions: N" counter, green completion state with 3s auto-hide, tabular-nums, reduced-motion compliance, CSS defensive hardening, first-sentence overlay text extraction. 3 phases, 5 plans, 10 requirements.

### Deferred to Next Milestone
- [ ] Phase 165 live reruns and diagnostics closure on the hosted dashboard path -- deferred from v0.9.25 as accepted tech debt; requires reloaded unpacked extension and `__FSBDashboardTransportDiagnostics`-exposing dashboard build

### Backlog (Completed from previous milestones — v0.9.6)

- [x] Server relay on fly.io — WebSocket coordinator connecting all FSB instances -- v0.9.6/P40
- [x] Showcase/dashboard site on fly.io — public landing page + QR-authenticated control center -- v0.9.6/P43
- [x] QR code pairing — FSB generates unique hash per user, dashboard scans to pair -- v0.9.6/P41
- [x] DOM cloning stream — real-time DOM reconstruction on dashboard (code complete, unverified) -- v0.9.6/P44
- [x] Remote task control — create and monitor tasks from dashboard, see FSB working live -- v0.9.6/P42

### Backlog

- [ ] Reliable CAPTCHA detection -- eliminate false positives on normal pages
- [ ] Smart multi-tab management -- context-aware navigation across multiple tabs

### Sunset in v0.9.45rc1 (background agents -- defer to OpenClaw / Claude Routines)

The following backlog items are formally retired in v0.9.45rc1. Better external runtimes (OpenClaw, Claude Routines) handle background-agent workflows; FSB will not reinvent that wheel. Code paths are commented out (not deleted) to allow future revival if the strategic landscape changes.

- [x] MCP agent tools -- create/list/run/stop/delete agents via MCP -- retired (was v0.9.10/P116)
- [x] Cost & metrics pipeline -- real token/cost data in agent history -- retired (was v0.9.10/P117)
- [x] Scheduling enhancements -- cron expressions, retry with backoff -- retired (was v0.9.10/P118)
- [x] Replay intelligence -- dynamic timing, step-level recovery -- retired (was v0.9.10/P119)
- [x] Sidepanel agents UI -- dedicated tab for agent management -- retired (was v0.9.10/P120)

### Out of Scope

- Firefox support -- requires significant Manifest V2/V3 adaptation, defer to future
- CAPTCHA solving -- third-party integration complexity, users can solve manually
- Offline mode -- AI requires connectivity, not feasible for core functionality
- Headless server-side execution -- server is relay only, user's browser must stay active
- Video/screenshot streaming -- DOM cloning with CDN images, not pixel capture

## Previous Milestone: v0.9.25 MCP & Dashboard Reliability Closure (shipped 2026-04-11, accepted tech debt)

**Shipped:** Restricted-tab MCP parity, dashboard preview/remote-control/task-relay rebaseline, v0.9.24 runtime carryover cleanup, live-confirmed auth-wall preserved partial/resume evidence, and a defensive duplicate printable `char` suppression fix in `background.js`. 5 phases, 8 plans, 11 requirements (9 satisfied, 2 satisfied with live-environment debt).

**Accepted debt:** Phase 165 blocked DET and JS-heavy live rerun rows deferred to next milestone (code posture is stable; the gap is live-environment observability). See [.planning/v0.9.25-MILESTONE-AUDIT.md](v0.9.25-MILESTONE-AUDIT.md).

## Previous Milestone: v0.9.24 Claude Code Architecture Adaptation (shipped 2026-04-05)

**Shipped:** Typed session/runtime architecture, engine configuration and hook pipeline extraction, resumable agent-loop/module adoption, SessionStateEmitter UI delivery, partial/auth-blocked outcome preservation, and overlay lifecycle reliability. 10 phases, 20 plans, 33 requirements.

## Deferred Milestone: v0.9.23 Dashboard Stream & Remote Control Reliability (incomplete, deferred)

**Goal:** Audit and fix the website dashboard sync path for reliable streaming, remote control, and task delivery.

## Previous Milestone: v0.9.22 Showcase High-Fidelity Replicas (incomplete, superseded)

**Goal:** Replace the outdated "See It in Action" renders on the showcase site with pixel-accurate HTML/CSS/JS replicas of the real sidepanel, control panel (options.html), and MCP-in-Claude-Code examples.

## Previous Milestone: v0.9.21 UI Retouch & Cohesion (shipped 2026-04-02)

**Shipped:** Shared UI baseline, sidepanel/popup retouch, control panel/dashboard cleanup, target-aware overlay feedback, and final UI regression sweep. 5 phases, 9 plans, 15 requirements.

## Previous Milestone: v0.9.20 Autopilot Agent Architecture Rewrite (shipped 2026-04-02)

**Shipped:** Native tool_use agent loop, canonical shared tool registry, unified execution pipeline, on-demand context tools, safety controls, and dead-code cleanup. 8 phases, 11 plans, 32 requirements.

## Previous Milestone: v0.9.11 MCP Tool Quality (shipped 2026-03-31)

**Shipped:** Site-aware search, cookie consent auto-dismiss, smart Enter fallback, viewport-aware interaction, BF cache resilience, content extraction reliability. 6 phases, 8 plans, 21 requirements.

## Previous Milestone: v0.9.8.1 npm Publishing (shipped 2026-04-02)

**Shipped:** Public npm release for `fsb-mcp-server`, tag-driven publish workflow, root/package MCP docs, optional local HTTP mode, and built-in setup/health commands for MCP host onboarding.

## Previous Milestone: v0.9.9.1 Phantom Stream (shipped 2026-03-31)

**Shipped:** Auto-connect DOM stream on WebSocket handshake, layout modes, visual fidelity improvements, remote browser control, and task-result relay to the dashboard.

## Previous Milestone: v0.9.9 Shipped

**Shipped:** 2026-03-25. Excalidraw Mastery -- full drawing tool mastery (all primitives, text entry, styling, connectors, alignment, export, NL diagram generation) plus universal Canvas Vision system (draw call interception for 12/15 canvas apps). 9 phases, 14 plans, 56 requirements.

## Previous Milestone: v0.9.8 Shipped

**Shipped:** 2026-03-23. Autopilot Refinement -- bridged tool gap with MCP manual mode, refined prompting with tool selection guide and canvas task detection, embedded 500+ diagnostic recommendations in 49 site guides, added procedural memory extraction and cross-domain strategy transfer, hardened robustness (viewport validation, prompt trimming, parse retry), fixed CDP direct routing and completion detection. 8 phases, 14 plans.

## Previous Milestone: v0.9.7 Shipped

**Shipped:** 2026-03-22. MCP Edge Case Validation -- 50 edge case prompts tested via MCP manual mode across canvas, micro-interaction, infinite scroll, context bloat, and dark pattern categories. 6 new CDP tools added, 30+ site guides created, 50 diagnostic reports generated. Evidence base built for autopilot refinement.

## Previous State: v0.9.6 Shipped

**Shipped:** 2026-03-19. Agents & Remote Control -- WebSocket relay, QR pairing, dashboard, DOM cloning, MCP server with WebSocket bridge (7 phases, phases 40-46).

## Context

**Previous milestones:** v0.9 (Reliability), v9.0.2 (AI Situational Awareness), v9.3 (Tech Debt), v9.4 (Career Search), v10.0 (CLI Architecture), v0.9.2 (Productivity Sites), v0.9.3 (Memory Tab), v0.9.4 (AI Quality), v0.9.5 (Progress Overlay Intelligence), v0.9.6 (Agents & Remote Control), v0.9.7 (MCP Edge Case Validation), v0.9.9 (Excalidraw Mastery + Canvas Vision), v0.9.20 (Autopilot Agent Architecture Rewrite)

**Tech stack:** Chrome Extension Manifest V3, vanilla JavaScript (ES2021+), xAI Grok / OpenAI / Anthropic / Gemini / OpenRouter APIs.
**Codebase:** background.js (~11K lines), ai-integration.js (~5K lines), content/ modules (10 files), 50+ site guide files, CLI parser (cli-parser.js), Task Memory system.

**Known tech debt:**
- `uiReadySelector` option in waitForPageStability implemented but no caller wires it yet
- Site Guides Viewer design mismatch (displays as accordion, should match memory-style list with mind maps)
- fsbElements use data-fsbLabel annotation path vs [hint:] tags from buildGuideAnnotations
- Dashboard website sync path still needs end-to-end validation across relay reconnects, stream lifecycle transitions, remote control events, and task/result delivery
- A final local rerun of the off-screen dashboard refresh smoke is still pending before any push or release tagging that depends on the v0.9.27 verification evidence
- MCP visual sessions still require a caller-supplied trusted label from the allowlist; identity is not yet derived automatically from MCP connection metadata.

## Constraints

- **Platform**: Chrome Extension Manifest V3 - service worker lifecycle, message passing patterns
- **No build system**: Direct JavaScript execution, no transpilation - keep it simple
- **AI dependency**: Relies on external AI APIs - must handle latency, rate limits, failures gracefully
- **Browser security**: Content scripts run in isolated world, limited access to page JavaScript context

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Focus on mechanics, not AI | User confirmed AI intent is correct, execution layer is the problem | Good -- v0.9 shipped with reliable execution |
| Visual feedback with orange glow | User specifically requested seeing what's being targeted | Good -- Shadow DOM isolation prevents CSS conflicts |
| Single-attempt reliability over retry sophistication | Core value is precision, not recovery from imprecision | Good -- verification + fallback selectors cover edge cases |
| 50 element limit for AI context | Reduce noise from 300+ elements | Good -- AI makes better decisions with focused context |
| Shadow DOM for visual overlays | Complete style isolation from page CSS | Good -- works on any website without conflicts |
| Outcome-based dynamic delays | Replace static category delays with actual page state detection | Good -- faster execution without sacrificing reliability |
| 15K prompt budget with 40/50/10 split | Balance system prompt, page context, and memory | Good -- 3x more context, AI identifies elements it previously missed |
| Multi-signal completion scoring | Replace unreliable AI self-report with weighted signals | Good -- system stops reliably within 1-2 iterations of actual completion |
| Data dependency chain for phases | Signals -> DOM -> changes -> memory -> completion | Good -- each phase's output feeds the next, no circular dependencies |
| Local fallback for memory extraction | No AI dependency for memory population | Revisit -- removed in v9.3, AI-only with badge error indicator |
| window.FSB namespace for modules | Module communication without ES modules or bare globals | Good -- clean namespace, works with programmatic injection |
| Store-first-enrich-second for memory AI | Enrichment never blocks storage | Good -- memory always saved, AI analysis added asynchronously |
| Pure heuristic cross-site patterns | No AI API costs during consolidation | Good -- keyword-based classification sufficient |
| AI-only extraction (no local fallback) | Surface configuration errors visibly | Good -- forces correct provider setup |
| Formatted clipboard paste for Google Docs | Convert markdown to HTML, paste via Clipboard API + CDP | Good -- rich formatting (tables, bold, lists) in canvas editors |
| Strict phase dependency chain for v9.4 | Pipeline -> single-site -> multi-site -> Sheets entry -> formatting | Good -- each phase's output feeds the next |
| Collect-all-then-write pattern | Accumulate jobs across all sites before opening Sheets once | Good -- avoids tab switching chaos, single Sheets session |
| Name Box navigation for Sheets | Canvas grid is unreadable, Name Box + Tab/Enter is reliable | Good -- works consistently, avoids coordinate guessing |
| URL-based batch suppression for Sheets | Sheets canvas concatenates rapid types, detect via URL regex | Good -- prevents data corruption with graceful fallback |
| Escape-before-NameBox protocol | Explicit Escape step before every Name Box navigation | Good -- eliminates cell edit mode trapping |
| Static timezone-to-country map (85 entries) | No npm dependency for locale detection | Good -- zero dependencies, covers all major timezones |
| CLI-only mode (no JSON fallback) | Full commitment to CLI format -- models must comply | Good -- all 4 providers comply, ~40-60% token reduction |
| Unified markdown snapshot | Interleave text and element refs instead of separate listings | Good -- AI sees page context naturally, token-efficient |
| Multi-strategy selector resilience | 5 selectors per Google Sheets element, first match wins | Good -- survives Google DOM changes |
| aria/role-first selectors for Notion/Airtable | CSS Module hash resilience via stable ARIA attributes | Good -- survives framework CSS changes |
| data-testid-first for Trello/Jira | Atlassian test IDs are more stable than class names | Good -- consistent across Atlassian UI updates |
| Recon report framing for AI extraction | Intelligence analyst producing consolidated report | Good -- single Task Memory per session vs 1-5 fragments |
| Observation-based stability detection | Replace setTimeout with DOM/network quiescence monitoring | Good -- faster on fast pages, patient on slow ones |
| Parallel debug fallback | Heuristic + AI fire concurrently, fastest wins | Good -- common fixes instant, rare ones get AI analysis |
| Retroactive actionHistory patching | Debug results arrive after slimActionResult; patch last entry | Good -- no flow restructuring needed, clean separation |
| diagnosticSuggestions naming | Avoid collision with existing singular `suggestion` field | Good -- clear distinction between 8-point and debug AI sources |
| Phase-weighted progress bands | navigation 0-30%, extraction 30-70%, writing 70-100% | Good -- progress reflects actual task advancement |
| Complexity-aware ETA with decaying weight | 70% estimate early, 10% late (trust actual data over time) | Good -- stable early ETA, accurate late ETA |
| Fire-and-forget AI summaries | generateActionSummary never awaited, 2.5s timeout | Good -- zero impact on automation speed |
| 300ms phase label debounce | Only debounce generic labels, bypass for explicit statusText | Good -- no flicker, AI summaries still instant |
| Close v0.9.25 with accepted tech debt | Phase 165 live-environment gap is observability, not code debt; defensive background.js fix shipped and passes tests | Good -- milestone archived 2026-04-11, blocked DET/JS rows deferred to v0.9.26 live-verification phase |
| Version bump 0.9.20 -> 0.9.25 at milestone close | Ship version was five milestone labels behind; align 1:1 with closing milestone for operator clarity | Good -- manifest/package/UI/README/CLAUDE all consistent at 0.9.25 |
| Display firewall before display changes | Data audit/field dependency mapping FIRST, then overlay changes, to avoid breaking dashboard/sidepanel/popup/MCP consumers | Good -- no consumer regressions, all fields verified via inline audit comments |
| scaleX() + rAF in content script | GPU-composited bar avoids layout thrash; local timer avoids background.js message latency | Good -- zero reflows, timer accuracy independent of message passing |
| First-sentence extraction for overlay text | AI summaries are multi-sentence; truncating mid-sentence is worse than showing only the first sentence | Good -- overlay text is concise and reads naturally |
| v0.9.35 focuses MCP on plug-and-play reliability before new MCP features | User reports repeated MCP/extension restarts and platform tinkering across Claude, Codex, and OpenClaw/OpenCode-style hosts | Good -- shipped bridge recovery, diagnostics, installer parity, and release smoke coverage |
| Explicit MCP visual sessions over implicit tool side effects | User wants the existing glow/overlay to be controllable from MCP even when FSB autopilot is not running | Good -- shipped in v0.9.36 with explicit start/end ownership |
| Fixed client badge allowlist over freeform caller text | The overlay should show trusted labels like Claude and Codex without allowing arbitrary spoofed strings | Good -- shipped in v0.9.36 with shared server/extension validation |
| Keep client-owned visual sessions separate from autopilot `activeSessions` | Manual MCP flows need clear ownership of the visible browser surface without colliding with FSB task runs | Good -- v0.9.36 keeps one owner per tab and avoids manual/autopilot overlap |
| Persist visual-session replay state in `chrome.storage.session` | Reinjection and service-worker churn should preserve the same owner, badge, and final-clear deadlines | Good -- v0.9.36 replays running/final states without stretching stale glow |
| Keep `run_task` and explicit visual sessions as separate MCP workflows | Autopilot planning and manual tool-driven browsing are different operator intents | Good -- v0.9.36 docs now steer callers to the right contract |
| FSB mints agent IDs (callers cannot supply) | Eliminate spoofing class entirely; ID is an FSB-internal authority | Good -- v0.9.60 `crypto.randomUUID()` with `agent_<uuid>` prefix; cross-agent rejection works on first claim |
| Single dispatch chokepoint enforces ownership in same microtask as dispatch | Avoid TOCTOU between gate and execution; prevent any path that bypasses the gate | Good -- v0.9.60 inline `checkOwnershipGate` at `dispatchMcpToolRoute` with three typed reject codes |
| Resolver helper feeds resolved tabId back into routeParams | Single source of truth so the dispatch gate sees the same tabId as the resolver | Good -- v0.9.60 D-16 closure; `(agentId, tabId, ownership_token)` enforced on every non-creating MCP call |
| Default cap 8, range 1-64, no queue, fail-loud on cap | User wants visibility into saturation, not silent backpressure | Good -- v0.9.60 `AGENT_CAP_REACHED` typed error; active agents grandfathered when cap is lowered |
| `connection_id`-keyed reconnect grace, not idle timeout | Network blips on the MCP transport should not orphan tabs; user-driven close should | Good -- v0.9.60 `RECONNECT_GRACE_MS` (~10s) keyed by connection_id; pool-shrink-vs-release order independent |
| `run_task` resolves on lifecycle event with 600s safety net (not 300s ceiling) | Real long tasks were hitting an arbitrary timeout while completed lifecycle events were ignored | Good -- v0.9.60 (Phase 239 / Phase 236 reborn) lifecycle wins the race; SW eviction yields `partial_state` |
| Action tools always return `change_report`; read tools never do | Reduces follow-up `read_page` round-trips on action-heavy flows; keeps reads pristine | Good -- v0.9.60 ~halves tokens-per-task on action sequences; size-capped with `truncated` hint |
| Bootstrap-safe recovery tools must work from restricted active tabs | Active `chrome://newtab/` was blocking the same recovery tools the error message advised | Good -- v0.9.60 (Phase 247) `open_tab`/zero-owned `navigate`/`switch_tab`/`list_tabs` recover without content-script attachability while preserving cross-agent rejection |
| Background-tab-by-default for MCP-routed surfaces | MCP agents must not steal focus from the user or other agents | Good -- v0.9.60 (Phase 246) `open_tab` defaults background; agent-scoped tab resolution replaces `chrome.tabs.query({active:true})` everywhere except synthesized `legacy:*` agents |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-10 -- Milestone v0.9.91 MCP Clients as Providers started. Next: requirements definition.*
