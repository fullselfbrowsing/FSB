# Feature Research

**Domain:** Local agent CLIs / agent subscriptions as first-class providers in another surface (browser side panel), mixed provider pickers, delegated-run streaming UX, browser-control consent, agent detection
**Milestone:** v0.9.91 MCP Clients as Providers
**Researched:** 2026-07-10
**Confidence:** HIGH (core UX conventions verified against official docs: Zed, Cline, Claude Code, ACP, Apple, GitHub, Google, OpenAI; individual items flagged where lower)

> Supersedes the prior v1.2.0 FEATURES.md (Showcase i18n Completeness research, archived milestone -- unrelated domain). This file is the active v0.9.91 MCP Clients as Providers research.

## How Comparable Products Do This (survey)

The "front-end someone else's agent" pattern now exists in four distinct shapes, all shipping as of mid-2026:

1. **Same-dropdown provider pattern** — Cline and Roo Code list "Claude Code" as an entry in the *same* API Provider dropdown as Anthropic/OpenAI/etc. Selecting it swaps the API-key field for a CLI-path field ("usually `claude` if in PATH") and the tool spawns a `claude` process per message, billing against the user's Pro/Max subscription — "Max subscribers will see $0.00 costs" ([Cline docs](https://docs.cline.bot/provider-config/claude-code), [Cline blog](https://cline.bot/blog/how-to-use-your-claude-max-subscription-in-cline), [Roo Code PR #4864](https://github.com/RooCodeInc/Roo-Code/pull/4864)). Cline later added "Bring your ChatGPT subscription" via sanctioned Codex OAuth ([Cline blog](https://cline.ghost.io/introducing-openai-codex-oauth/)).
2. **Separate "External Agents" section pattern** — Zed keeps ACP agents (Claude Agent, Gemini CLI, Codex, Copilot) in the Agent Panel's new-thread menu, distinct from Zed-hosted/API-key model providers. Auth is agent-owned (`/login` inside the thread); "An Anthropic API key configured for Zed Agent does not automatically configure Claude Agent" ([Zed external-agents docs](https://zed.dev/docs/ai/external-agents), [Zed ACP blog](https://zed.dev/blog/bring-your-own-agent-to-zed)).
3. **Account-sign-in provider pattern** — Xcode 26 mixes built-in ChatGPT/Claude *account* providers (Sign In button, no key) with add-your-own API-key providers; agentic coding only works with the preconfigured account providers ([Apple docs](https://developer.apple.com/documentation/xcode/setting-up-coding-intelligence), [9to5Mac 2025-08-28](https://9to5mac.com/2025/08/28/new-xcode-beta-now-available-with-gpt-5-and-claude-support/)).
4. **Hosted pick-your-agent pattern** — GitHub Agent HQ ("mission control") lets users pick Copilot, Claude, or Codex per task, metered as one premium request per agent session ([GitHub blog](https://github.blog/news-insights/company-news/pick-your-agent-use-claude-and-codex-on-agent-hq/)).

Adjacent delegation front-ends: Conductor (Mac app; "sign in or confirm your machine already has a Claude Code or Codex session"; bundles its own CLI copies; "uses Claude Code however you're already logged in" — [docs](https://docs.conductor.build/)), Happy (mobile/web mirror of Claude Code/Codex with realtime streaming + push-notification permission approvals — [happy.engineering](https://happy.engineering/docs/features/)), Vibe Kanban (10+ executors behind one profile abstraction; auto-scans existing `.claude` dirs — [docs](https://vibekanban.com/docs/configuration-customisation/agent-configurations)), OpenCode (client/server split, `opencode serve` + remote clients — [docs](https://opencode.ai/docs/server/)).

Browser-control consent baselines: Claude in Chrome, ChatGPT Atlas agent mode, Gemini-in-Chrome auto-browse (details under Table Stakes / consent).

**FSB's structural difference:** every comparable front-ends an agent for *coding in a repo*. FSB front-ends the agent for *driving the user's live browser*, and the spawned agent loops back through FSB's own MCP tools — the delegation target and the visual surface are the same product. No surveyed product does side-panel-initiated spawn of a local CLI that then controls the user's real logged-in browser.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Agent providers listed in the same picker as API providers, with kind-specific fields (agent kind hides API-key field) | Cline/Roo set the convention: "Claude Code" sits in the API Provider dropdown; key field disappears, CLI-path field appears | LOW | FSB: rename "API Configuration" → "Providers" (`control_panel.html:146`), add `kind: api\|agent`. Existing 7 BYOK providers unchanged (INV-03) |
| "Uses your existing subscription/login — no API key needed" labeling on agent providers | Every comparable states this explicitly (Cline: "uses your Claude subscription limits instead of API token billing"; Xcode: account sign-in rows) | LOW | Copy only. Also state the inverse: FSB's Anthropic BYOK key does NOT make Claude Code work (Zed documents this exact confusion) |
| Installed/not-installed state per agent in the picker + detection from disk | Conductor gates onboarding on an existing Claude Code/Codex session; Vibe Kanban scans `.claude` dirs; Smithery CLI lists clients from config paths | MEDIUM | FSB already has the 21-client `platforms.ts` registry with per-OS config paths. Detection must run daemon-side (extension can't read disk); picker must degrade gracefully when daemon offline (show "unknown", not "not installed") |
| Live streaming progress with per-tool-call visibility | Zed shows tool-call status cards; Gemini-in-Chrome "details each step in a work log"; Atlas narrates actions; Happy streams responses in real time | HIGH | Map `claude -p --output-format stream-json --include-partial-messages` events (`system/init`, `stream_event` deltas, tool_use, `system/api_retry`, `result`) into a side-panel feed. Requires the new reverse-request channel over ws://7225 |
| Stop/kill button that actually interrupts the run | Universal: Zed stop button, Gemini "stop it and take over at any time", Atlas pause/take control, OpenCode remote "stop a running action", ACP `session/cancel` | MEDIUM | Kill spawned process tree + release the delegated agent's owned tabs (v0.9.60 ownership) + clear the visual session |
| Explicit offline/unavailable state with a recovery path | Claude Code ships an error table ("Browser extension is not connected" → fix steps) and a `/chrome` reconnect action; Zed exposes ACP logs for failed agent starts | MEDIUM | FSB constraint: no nativeMessaging → daemon can't be woken. Honest "agent offline → run `fsb-mcp-server doctor`" card is the floor; doctor already classifies layers |
| Consent gate before an agent can control the browser, with ask-vs-auto modes | Claude in Chrome: "Ask before acting" vs "Act without asking" + site-level always-allow + upfront plan listing sites; Atlas pauses on sensitive actions and forces watch mode on financial sites; Gemini auto-browse pauses before purchases/messages with "take over task" | MEDIUM-HIGH | Spawn channel is RCE-adjacent: first-enable opt-in (explicit toggle + warning), plus a per-run or per-session confirmation tier. Spawned CLI runs with strict permission defaults + `--strict-mcp-config` (FSB tools only) — never `--dangerously-skip-permissions` |
| Usage/cost reporting appropriate to provider kind | Cline shows $0.00 for Max-subscription runs; Claude Code `result` event carries `total_cost_usd` + per-model breakdown; GitHub meters premium requests per agent session; OpenCode TUI shows tokens+cost top-right | LOW-MEDIUM | Agent kind: show tokens/turns/duration + "included in your subscription", not fabricated dollars. API kind keeps the existing cost tracker. `result` event feeds the existing MCP request log |
| Follow-up messages keep context (thread ≈ session) | Zed threads map to agent sessions (ACP `session/load`); Codex `resume --last` / `codex exec resume`; Gemini `--resume` + `/chat` checkpoints; Claude Code `--continue`/`--resume <session_id>` (scoped to cwd) | MEDIUM | MVP can use Cline's stateless pattern (spawn per message, replay conversation) OR `--resume`; either way the side-panel thread must not amnesia between turns |
| Visible in-browser activity while the delegated agent works | All three browser agents keep actions visible; Claude Code --chrome runs "in a visible Chrome window in real time" and pauses at login/CAPTCHA for the human | LOW | Already built: orange glow, visual session badges, implicit visual-session contract (v0.9.36/v0.9.62). Ensure the spawned CLI's client identity maps to an allowlisted badge |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Ground-truth recommended default (connected > installed > copy-clicked) | Nobody recommends from evidence. Cline preselects its own paid gateway; Xcode just preconfigures accounts. FSB can badge "Recommended — Claude Code connected 2m ago" | MEDIUM | Needs the identity-capture trio: onboarding copy-click persist (client id already in `onboarding.js` handler), MCP `initialize` clientInfo capture (currently discarded), disk detection. Recommend, never auto-switch |
| Connected-agent ground truth from the MCP handshake (clientInfo through `agent:register`) | Comparables detect installs at best; none show *live* connections. A control-panel "Connected agents" roster with last-seen is unique observability | LOW-MEDIUM | clientInfo has zero references in `mcp/` today; `agent:register` payload is empty `{}`. Additive fields only (INV-01). Completes the v0.9.36 deferred item |
| Closed-loop delegation: side panel → spawn agent CLI → agent drives the same browser via FSB MCP tools | Inverts Claude Code --chrome (CLI-initiated) into panel-initiated. User asks in the browser; a subscription-grade agent does the work *in that browser* with FSB's visual feedback and tab ownership | HIGH | The spawned CLI connects back as a normal FSB agent (agent id, ownership token, cap 8). Ship a first-party `fsb` agent definition via `--agents` instead of prompt stuffing; hermetic `--strict-mcp-config` |
| Multi-agent adapter contract (detect / build / events / kill / caps) covering Claude Code → OpenCode → Codex → Gemini | Vibe Kanban proves 10+ executors behind one profile abstraction is tractable and valued; from a browser surface it's unowned territory | HIGH | Per-CLI interfaces differ: Claude stream-json; `codex exec` (+ `resume`/`--last`, JSONL sessions in `~/.codex/sessions/`); OpenCode is an HTTP server (OpenAPI), not a spawn; Gemini `--resume`. Caps matrix: task-mode vs chat-mode per adapter |
| Task-mode vs chat-mode (`--resume`) capability flags per adapter | Matches how users think: quick task vs ongoing conversation. Zed/ACP gate this with the `loadSession` capability; FSB can badge "supports follow-ups" | MEDIUM | Claude Code: `--resume <id>` scoped to project dir/worktree — daemon must pin cwd per thread. Codex: `exec resume`. Gemini: `--resume`. OpenCode: server sessions |
| Cross-surface session continuity (side-panel thread resumable in the terminal) | Because the delegated run IS a genuine Claude Code session on disk, `claude --resume <session_id>` continues it in the terminal. Happy's desktop↔mobile mirroring proves the appeal | LOW | Just surface the `session_id` from `system/init` in the thread UI ("Continue in terminal: claude --resume …"). Zed offers the reverse (import external-agent threads) |
| Doctor-integrated failure UX | Zed's answer to a broken agent is raw ACP logs; FSB's is a layer-classifying `doctor` with guided recovery — friendlier by design | LOW-MEDIUM | Extend doctor with delegation checks: agent binary found, version, auth state, spawn-channel secret. Deep-link from the side-panel offline card |
| Per-run plan/scope preview in the consent prompt | Claude in Chrome reviews an upfront plan with the sites it will touch; applying that to "spawn X locally, it may control tabs A/B" beats a bare Allow/Deny | MEDIUM | Tier it: first enable (scary, explicit) → per-run summary (task + agent + scope) → in-run high-risk confirmations already governed by FSB's existing consent surfaces |
| Kill switch that also reclaims tabs and shows what the agent still owns | Comparables kill the process; none reconcile browser state afterward. FSB's tab ownership makes "agent stopped, 2 tabs released" reportable | MEDIUM | Builds directly on v0.9.60 ownership + reconnect-grace machinery |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Reuse subscription OAuth tokens / spoof Claude Code headers / use Agent SDK with consumer OAuth | "Just call the API with my Max token — no spawn needed" | Banned. Anthropic blocked it Jan 9 2026 (silent), ToS-clarified Feb 18-20 2026, fully enforced Apr 4 2026; tools get "This credential is only authorized for use with Claude Code". OpenClaw/OpenCode/NanoClaw all hit it ([The Register](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/), [claude-code#28091](https://github.com/anthropics/claude-code/issues/28091)) | Spawn the genuine `claude` binary under the user's own login (Cline/Roo/Zed/Conductor all still ship this; "running the official Claude Code binary… you are fine"). Keep BYOK API kind as a first-class fallback. Note: OpenAI *sanctions* ChatGPT-subscription OAuth for third parties (Cline Codex OAuth) — auth policy is per-vendor, so encode it in the adapter |
| Bundle or silently auto-install agent CLIs | "One-click setup" (Conductor bundles Claude Code + Codex) | Conductor is a signed native Mac app; FSB is an MV3 extension + npm daemon. Silent installs from a browser-adjacent surface are a security smell, create version drift, and can't happen extension-side at all | Detect from disk + show the copy-able install command (onboarding already has per-client commands) + doctor verification |
| PTY/TUI screen-scraping of the agent's interactive UI | "The TUI already shows everything — just mirror it" | Brittle (ANSI parsing, resize, version drift), no structured tool-call/cost/session data, no clean cancel semantics | Structured headless interfaces only: `claude -p` stream-json, `codex exec` (JSONL sessions), `opencode serve` HTTP API, `gemini` non-interactive |
| Default the spawned agent to `--dangerously-skip-permissions` (or equivalent) for smooth demos | "Permission prompts interrupt the magic" | RCE-adjacent channel + agent with Bash access + browser control = worst-case blast radius. Claude Code's own plan mode auto-allows only read-only browser calls and prompts on state changes | Strict defaults: `--allowedTools`/permission-mode allowlist scoped to FSB MCP tools, `--strict-mcp-config`, no filesystem/Bash beyond what delegation needs; escalation prompts surface in the side panel (Happy's remote Allow/Deny proves this works) |
| General remote-access layer (LAN/tunnel/mobile) for delegation | OpenCode-remote ecosystem (Tailscale/ngrok clients) shows real demand | Scope explosion; every remote hop widens the RCE surface FSB just gated to extension-origin + shared secret on localhost:7225 | Stay localhost-only this milestone; FSB's dashboard-remote mode remains the separate, existing remote surface |
| Show dollar costs for subscription-backed runs | "Cost tracker already exists — reuse it" | Fabricated numbers (user pays $0 marginal); Cline deliberately shows $0.00 for Max runs. Misleads users into thinking delegation is expensive | Show tokens/turns/duration + "included in your <agent> subscription"; keep `MODEL_PRICING` estimates for telemetry aggregates only, labeled as estimates |
| Force/funnel users to agent providers (degrade BYOK) | "Subscriptions are the future; simplify to one path" | Cursor's BYOK restrictions (agent features require their plan even with your key) generate durable resentment; FSB's INV-03 promises provider parity | Both kinds first-class; recommendation badge only. BYOK autopilot remains the zero-daemon path |
| Auto-switch the selected provider when a "better" agent connects | "Ground truth says Claude Code is here — use it" | Surprise provider swaps mid-workflow break trust and mask cost/behavior changes; no comparable does this | Recommend with a badge + one-tap switch; persist explicit user choice as sticky |

## UX Convention Notes (per research question)

**Provider picker mixing kinds.** Two proven layouts: same-dropdown-with-morphing-fields (Cline/Roo — lowest friction, fits FSB's existing single panel) and separate-section (Zed External Agents; Xcode accounts vs API providers). Either way: agent entries never show a key field; they show install/auth state instead. "Recommended" defaults exist everywhere but are vendor-motivated (Cline preselects its own gateway; free-tier suggestions for beginners) — an evidence-based badge is FSB's opening. Unavailable states today are weak across the board (Cline documents no missing-CLI error UX; Zed points at raw logs) — treat "installed but unavailable", "not installed", and "daemon offline" as three distinct picker states.

**Streaming-progress conventions.** The converged grammar: narrated step feed + collapsible tool-call cards with status + prominent stop + final result card with usage. Zed adds "follow the agent" (jump to what it touches — FSB's equivalent is the already-visible glow/badge on the live tab) and review-before-apply (not applicable: browser actions aren't diffs, which is exactly why consent must be *pre*-action). Claude Code's stream gives everything needed: `system/init` (session_id, model, tools — render "Claude Code session started"), tool_use blocks (feed rows), `system/api_retry` (transient-state row with typed error categories), `result` (`total_cost_usd`, `num_turns`, duration → summary card).

**Consent for browser control.** Three-layer convention across Claude in Chrome / Atlas / Gemini auto-browse: (1) mode choice (ask-before-acting vs act-with-guardrails), (2) scope disclosure upfront (plan with sites), (3) hard confirmations for sensitive actions + categorical blocks (financial) + pause-for-human at login/CAPTCHA. FSB must add a layer none of them need: consent to *spawn a local process* (first-enable toggle + per-run confirm), because the delegation channel, not the browsing, is the new risk.

**Session continuity.** Users now expect thread↔session mapping (Zed/ACP `session/load`; Codex/Gemini/Claude resume). Stateless replay-per-message (Cline) is acceptable for task-mode MVP but wastes subscription tokens and loses agent-side context (todos, plan state); `--resume` chat-mode is the expected v1.x follow-up. Claude Code resume is cwd-scoped — the daemon must keep a stable working directory per thread.

**Detection UX.** Convention is confirm-not-configure: Conductor "confirm your machine already has a Claude Code session"; Vibe Kanban silently reuses `.claude` config; Claude Code's Chrome flow auto-opens a connect tab once on first install, then never again (v2.1.199 behavior). So: "We found Claude Code installed — connect it?" with one action, remembered forever, re-verifiable via doctor. Never nag on every panel open.

## Feature Dependencies

```
Providers panel rename + kind field (api|agent)
    └──requires──> existing control panel API Configuration section (control_panel.html:146)

Recommended-default badge
    └──requires──> Identity capture trio:
                      onboarding copy-click persist (extension/ui/onboarding.js handler has client id)
                      MCP initialize clientInfo capture ──> agent:register payload (empty {} today; additive, INV-01)
                      disk detection (platforms.ts 21-client registry, daemon-side)

Side-panel delegation (Claude Code MVP)
    └──requires──> reverse-request channel over ws://localhost:7225 (extension-origin gating + shared secret)
    └──requires──> consent tiers (first-enable + per-run)
    └──requires──> Claude Code adapter (spawn claude -p, stream-json, strict permissions, --strict-mcp-config, fsb agent definition)
    └──requires──> tab ownership + agent ids + cap 8 (v0.9.60, exists)
    └──requires──> visual session badges + client allowlist (v0.9.36/v0.9.62, exists)
    └──requires──> fifth EXECUTION_MODES entry "delegated" (extension/ai/engine-config.js)

Streaming progress feed + kill switch ──requires──> delegation channel
Usage/cost summary card ──requires──> stream-json result event; ──enhances──> existing MCP request logging + cost tracker
Offline → doctor handoff ──requires──> doctor (exists); ──enhances──> delegation (graceful degradation)
Chat-mode (--resume) ──requires──> task-mode adapter + per-thread cwd pinning
Multi-agent adapters (OpenCode/Codex/Gemini) ──requires──> AgentProviderAdapter contract proven on Claude Code
Cross-surface resume hint ──requires──> session_id surfaced from system/init

Auto-switch on detection ──conflicts──> sticky explicit provider choice
Subscription-token proxying ──conflicts──> Anthropic ToS (spawn genuine binary instead)
```

### Dependency Notes

- **Delegation requires a live daemon:** the extension has no nativeMessaging permission and cannot wake any process — agent-kind providers are only *runnable* when `fsb-mcp-server serve` (or an open agent session) is up. This makes the offline state a first-class picker/thread state, not an error path.
- **Identity capture is independent of delegation:** the trio (clicks/clientInfo/disk) ships value on its own (control-panel roster, recommended badge) and can land before the spawn channel — a natural phase boundary.
- **Adapter contract before adapter breadth:** Codex/OpenCode/Gemini adapters are cheap only if the Claude Code MVP fixes the contract (detect/build/events/kill/caps) rather than hardcoding Claude shapes. OpenCode will stress it usefully (HTTP server, not spawn).
- **Test-suite tripwires:** extension-side wiring (onboarding persist, providers panel, side-panel feed) trips source-pin tests (token counts/substrings) — run the suite from the first commit.

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] Providers panel rename + `api`/`agent` kinds; agent kind hides key field, shows install/auth/connection state — the naming and framing everything else hangs on
- [ ] Identity capture trio (copy-click persist, clientInfo capture through `agent:register`, disk detection) + control-panel connected/installed roster — ground truth
- [ ] Recommended-default badge from ground truth (connected > installed > copy-clicked); never auto-switch
- [ ] Claude Code delegation MVP: consent-gated spawn over ws://7225, `claude -p` stream-json, strict permissions + `--strict-mcp-config` + shipped `fsb` agent definition, spawned CLI connects back with its own agent id/tab ownership
- [ ] Live progress feed (init/tool/retry/result events) + kill switch that releases owned tabs
- [ ] Honest offline state → doctor handoff
- [ ] Usage summary card per delegated run (tokens/turns/duration, "included in your subscription")

### Add After Validation (v1.x)

- [ ] Chat-mode continuity via `--resume` + per-thread cwd pinning — add once task-mode proves the channel; trigger: users sending follow-ups that lose context
- [ ] OpenCode → Codex → Gemini adapters behind the proven contract; trigger: adapter contract stable through one release
- [ ] Cross-surface resume hint (`claude --resume <id>`) — trivial once session ids are surfaced
- [ ] Doctor delegation checks (binary found/version/auth/spawn-secret)

### Future Consideration (v2+)

- [ ] Native-messaging host to wake the daemon — removes the biggest UX cliff but adds an installer + attack surface; explicitly deferred in milestone context
- [ ] ACP-based adapter unification (speak ACP to `claude-code-acp`/Gemini instead of per-CLI formats) — watch ACP adoption; would collapse adapter maintenance
- [ ] Remote delegation surfaces (mobile approvals à la Happy) — only after the localhost security posture has soak time

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Providers panel + kinds | HIGH | LOW | P1 |
| Identity capture trio + roster | HIGH | MEDIUM | P1 |
| Recommended badge (ground truth) | MEDIUM | LOW | P1 |
| Claude Code delegation + consent + spawn channel | HIGH | HIGH | P1 |
| Streaming feed + kill switch | HIGH | MEDIUM | P1 |
| Offline → doctor UX | HIGH | LOW | P1 |
| Usage summary (subscription framing) | MEDIUM | LOW | P1 |
| Chat-mode `--resume` | HIGH | MEDIUM | P2 |
| OpenCode/Codex/Gemini adapters | MEDIUM | HIGH | P2 |
| Cross-surface resume hint | MEDIUM | LOW | P2 |
| Native-messaging wake | HIGH | HIGH | P3 |
| ACP adapter unification | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for this milestone's goal (agent CLIs as first-class side-panel providers)
- P2: Should have; natural fast-follow within the milestone arc
- P3: Deferred; revisit after the delegation channel has soak time

## Competitor Feature Analysis

| Feature | Cline/Roo (Claude Code provider) | Zed (ACP external agents) | Claude in Chrome / Atlas / Gemini auto-browse | Our Approach |
|---------|----------------------------------|---------------------------|-----------------------------------------------|--------------|
| Provider mixing | Agent entry in same dropdown; key field → CLI path | Separate External Agents section; agent-owned auth | N/A (single first-party agent) | Same-panel with `kind` field; agent kind shows state, not keys |
| Detection | Manual CLI path ("usually `claude`") | Registry install, no disk detection | Extension auto-connect tab on first install | Disk detection via 21-client registry + connected ground truth from the MCP handshake |
| Streaming | Wraps CLI per message; "may not stream token-by-token" | Tool-call cards, follow-agent, stop, review diffs | Narrated work log, step details, stop/take-over | stream-json event feed + existing in-browser glow/badges as "follow the agent" |
| Consent | None specific to spawning | Tool-forwarding permissions; native perms agent-owned | Ask-vs-auto modes, site allowlists, sensitive-action confirms, watch mode | Two new tiers (enable spawn, per-run) on top of FSB's existing browsing consent |
| Sessions | Stateless replay per message | Threads = agent sessions; import/restore | Per-task; no CLI session concept | Task-mode v1 → `--resume` chat-mode v1.x; thread↔session id surfaced |
| Cost | $0.00 for subscription runs | Agent-owned; not surfaced | Subscription-metered invisibly | Tokens/turns/duration + "included in subscription"; dollars only for API kind |

## Sources

- [Zed external agents docs](https://zed.dev/docs/ai/external-agents) + [GitHub source](https://github.com/zed-industries/zed/blob/main/docs/src/ai/external-agents.md) (fetched 2026-07-10); [Bring Your Own Agent blog](https://zed.dev/blog/bring-your-own-agent-to-zed); [Agent Panel docs](https://zed.dev/docs/ai/agent-panel); [zed#50142 diff-review gap for external agents](https://github.com/zed-industries/zed/issues/50142)
- [Agent Client Protocol — protocol overview](https://agentclientprotocol.com/protocol/overview) (`session/new`, `session/load`, `session/update`, `session/request_permission`, `session/cancel`, `initialize`/`authenticate`) (fetched 2026-07-10)
- [Cline Claude Code provider docs](https://docs.cline.bot/provider-config/claude-code); [Cline blog: Claude Max in Cline ($0.00 display)](https://cline.bot/blog/how-to-use-your-claude-max-subscription-in-cline); [Cline: ChatGPT subscription via Codex OAuth](https://cline.ghost.io/introducing-openai-codex-oauth/); [Roo Code PR #4864](https://github.com/RooCodeInc/Roo-Code/pull/4864)
- [Claude Code headless docs — `-p`, stream-json events, `--resume`, permissions, `--agents`, `total_cost_usd`](https://code.claude.com/docs/en/headless) (fetched 2026-07-10); [Claude Code with Chrome docs — connection, plan-mode read/write split, error table](https://code.claude.com/docs/en/chrome) (fetched 2026-07-10)
- [Claude in Chrome permissions guide](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide); [Use Claude in Chrome safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely)
- [OpenAI: Introducing ChatGPT Atlas (2025-10-21)](https://openai.com/index/introducing-chatgpt-atlas/); [Atlas agent help](https://help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas)
- [Google: Gemini 3 auto-browse in Chrome (Dec 2025)](https://blog.google/products-and-platforms/products/chrome/gemini-3-auto-browse/); [9to5Google on agentic security (2025-12-08)](https://9to5google.com/2025/12/08/gemini-chrome-agentic-security/)
- [Apple: Setting up coding intelligence (Xcode 26)](https://developer.apple.com/documentation/xcode/setting-up-coding-intelligence); [9to5Mac (2025-08-28)](https://9to5mac.com/2025/08/28/new-xcode-beta-now-available-with-gpt-5-and-claude-support/)
- [GitHub Agent HQ announcement (2025-10)](https://github.blog/news-insights/company-news/welcome-home-agents/); [Pick your agent: Claude and Codex on Agent HQ](https://github.blog/news-insights/company-news/pick-your-agent-use-claude-and-codex-on-agent-hq/)
- [Conductor docs (bundled CLIs, login detection)](https://docs.conductor.build/); [Happy features (remote permission approvals, streaming)](https://happy.engineering/docs/features/); [Vibe Kanban agent profiles](https://vibekanban.com/docs/configuration-customisation/agent-configurations); [OpenCode server docs](https://opencode.ai/docs/server/); [Smithery CLI](https://smithery.ai/docs/concepts/cli)
- Codex sessions/resume: [developers.openai.com Codex CLI](https://developers.openai.com/codex/cli/features); [codex resume guide](https://inventivehq.com/knowledge-base/openai/how-to-resume-sessions). Gemini sessions: [Gemini CLI session management](https://geminicli.com/docs/cli/session-management/)
- Anthropic subscription-OAuth ban (Jan-Apr 2026): [The Register (2026-02-20)](https://www.theregister.com/2026/02/20/anthropic_clarifies_ban_third_party_claude_access/); [anthropics/claude-code#28091](https://github.com/anthropics/claude-code/issues/28091); [Kersai workaround survey](https://kersai.com/anthropic-killed-third-party-claude-access-heres-every-workaround-that-still-works/). **Note:** wrapping the *genuine* binary is not explicitly blessed in writing — LOW-MEDIUM confidence on formal permission, HIGH confidence on ecosystem practice (Cline/Roo/Zed/Conductor all ship it as of 2026-07)
- Cursor BYOK restrictions (anti-feature evidence): [APIpie fix guide](https://apipie.ai/docs/blog/Cursors-Does-Not-Work-with-Your-Current-Plan-or-API-Key-Fix)

---
*Feature research for: v0.9.91 MCP Clients as Providers (agent CLIs as side-panel providers)*
*Researched: 2026-07-10*
