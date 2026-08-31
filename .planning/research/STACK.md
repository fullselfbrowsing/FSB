# Stack Research

**Domain:** Headless agent-CLI spawning/supervision from a Node daemon (MCP-clients-as-providers, v0.9.91)
**Researched:** 2026-07-10
**Confidence:** HIGH (flag matrices verified against live local binaries + current official docs; see per-section notes)

> **Note:** This supersedes the v1.2.0 (Showcase i18n) `STACK.md` that occupied this path — unrelated to this milestone, recoverable from git history (same convention as the previous overwrite noted in that file's own header).

> **Scope guard:** Existing validated stack (MV3 extension, vanilla JS, `fsb-mcp-server` on `@modelcontextprotocol/sdk ^1.29`, ws 8.x bridge on 7225, streamable-HTTP on 7226, platforms.ts registry, install.ts writers, universal-provider.js) is NOT re-researched. Everything below is only what the four NEW features need.

---

## Headline Recommendation

**Add zero new runtime dependencies to `mcp/`.** Every new capability — spawning agent CLIs, supervising them, parsing their JSONL streams, capturing `clientInfo`, detecting installed clients — is achievable with Node built-ins (`node:child_process`, `node:readline`, `node:fs`, `node:os`) plus APIs already present in the pinned `@modelcontextprotocol/sdk`. Shell out to the **user's own installed CLIs** (subscription auth preserved); do **not** embed the Claude Agent SDK (API-key-only auth, policy-prohibited subscription use — see tradeoff section).

---

## Verified CLI Flag Matrices

Verification method: flags run against **locally installed binaries** where available (strongest evidence), cross-checked against official docs fetched 2026-07-10. Do not trust flag names from memory at build time — each adapter should version-probe (`<cli> --version`) and treat the matrices below as the contract for the listed versions.

### 1. Claude Code CLI — MVP adapter target

**Verified against:** local `claude` **2.1.177** (`--help` output, verbatim) + https://code.claude.com/docs/en/cli-reference + /docs/en/headless + /docs/en/permissions (fetched 2026-07-10). Confidence: **HIGH**.

| Capability | Flag (verbatim) | Notes |
|---|---|---|
| Headless run | `-p, --print` | "Print response and exit". All other flags compose with it. Prompt via argv or stdin pipe (stdin capped at 10MB since v2.1.128) |
| Streaming output | `--output-format stream-json` | Choices: `text` (default), `json` (single result), `stream-json` (newline-delimited JSON). Print mode only |
| Token-level partials | `--include-partial-messages` | "only works with --print and --output-format=stream-json". Emits `stream_event` lines with `text_delta` |
| Verbose (required) | `--verbose` | Docs' stream-json examples always include it; historically `-p --output-format stream-json` errors without `--verbose`. Include it unconditionally |
| Streaming input | `--input-format stream-json` | "realtime streaming input" — enables a persistent child receiving user turns as JSONL on stdin (chat-mode without respawn). Pairs with `--replay-user-messages` |
| Resume (chat-mode) | `-r, --resume [sessionId]` / `-c, --continue` | Session ID lookup is **scoped to the current project directory** and its worktrees — the daemon must use a stable per-provider cwd for resume to work |
| Fork / pin session | `--fork-session`, `--session-id <uuid>` | UUID must be valid; fork creates new ID on resume |
| Ephemeral (task-mode) | `--no-session-persistence` | "sessions will not be saved to disk and cannot be resumed (only works with --print)" |
| Agent persona | `--agent <name>` | "Agent for the current session. Overrides the 'agent' setting." |
| Inline agent definition | `--agents <json>` | Session-only, never written to disk — "useful for quick testing or automation scripts". Accepts full frontmatter fields: `description`, `prompt`, `tools`, `disallowedTools`, `model`, `permissionMode`, `mcpServers`, `hooks`, `maxTurns`, `skills`, `initialPrompt`, `memory`, `effort`, `background`, `isolation`, `color` |
| Tool allowlist | `--allowedTools` / `--allowed-tools <tools...>` | Comma or space separated; permission-rule syntax |
| Tool denylist | `--disallowedTools` / `--disallowed-tools` | Bare tool name removes tool from context entirely |
| Built-in tool restriction | `--tools ""` \| `"default"` \| `"Bash,Edit,Read"` | `--tools ""` strips ALL built-ins — strongest "browser-only" lockdown when combined with an MCP allowlist. Verify quoting behavior in a spike |
| Permission mode | `--permission-mode <mode>` | Choices at 2.1.177 (verbatim from --help): `"acceptEdits", "auto", "bypassPermissions", "default", "dontAsk", "plan"`. (`manual` alias exists only ≥2.1.200.) **`dontAsk` is the delegation default we want:** "Auto-denies tools unless pre-approved via `permissions.allow` rules" |
| Hermetic MCP | `--mcp-config <configs...>` + `--strict-mcp-config` | Verbatim: "Only use MCP servers from --mcp-config, ignoring all other MCP configurations". `--mcp-config` accepts JSON **files or strings** |
| System prompt | `--append-system-prompt <text>`, `--append-system-prompt-file <path>` | Also `--system-prompt(-file)` for full replacement — avoid; keep CC defaults |
| Budget rails | `--max-turns <n>` (print only), `--max-budget-usd <amt>` | Both exist at current versions; belt-and-suspenders alongside daemon wall-clock timeout |
| Non-interactive permission broker | `--permission-prompt-tool <mcp-tool>` | Optional later: route approval asks back through an FSB MCP tool instead of hard-deny |

**MCP tool wildcard semantics (verified verbatim, code.claude.com/docs/en/permissions, 2026-07-10):**

- `mcp__fsb` — "matches any tool provided by the `fsb` server"
- `mcp__fsb__*` — "uses wildcard syntax and also matches all tools from the server" (both forms valid today; older docs disallowed the `__*` form — this HAS changed)
- `mcp__fsb__read_page` — single tool
- Allow rules accept globs **only after a literal `mcp__<server>__` prefix** (`mcp__fsb__get_*` works); unanchored allow globs like `mcp__*` are "skipped with a warning". `mcp__*` works in **deny/ask** rules only.
- Recommendation: use bare `mcp__fsb` in `--allowedTools` (both forms equivalent; bare form is the one that has been stable across doc generations).

**Critical auth gotcha (verified):** `--bare` mode "skips OAuth and keychain reads. Anthropic authentication must come from `ANTHROPIC_API_KEY` or an `apiKeyHelper`". Docs recommend `--bare` for scripts, **but FSB must NOT use it** — subscription auth is the entire point of agent providers. Hermeticity comes from `--strict-mcp-config` + `--agents` + `--settings` instead, which leaves OAuth intact.

**stream-json event contract (verified, code.claude.com/docs/en/headless):** first line is `system` subtype `init` (session_id, model, tools, mcp_servers, plus a `capabilities` string array ≥2.1.205 — feature-detect from it, not from version strings); then `assistant`/`user` message lines, `stream_event` partials (with `--include-partial-messages`), `system/api_retry` on retryable API errors (fields: `attempt`, `max_retries`, `retry_delay_ms`, `error_status`, `error` category incl. `authentication_failed`, `billing_error`, `rate_limit`), terminal `result` line (includes `total_cost_usd`, per-model usage, `session_id`). One JSON object per line.

**Reference delegation invocation (MVP shape):**

```bash
claude -p --verbose \
  --output-format stream-json --include-partial-messages \
  --mcp-config '{"mcpServers":{"fsb":{"type":"http","url":"http://127.0.0.1:7226/mcp"}}}' \
  --strict-mcp-config \
  --agents "$(cat fsb-agent.json)" --agent fsb \
  --permission-mode dontAsk \
  --allowedTools "mcp__fsb" \
  --disallowedTools "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch" \
  --max-turns 40 \
  --no-session-persistence          # task-mode only; omit + capture session_id for chat-mode
# prompt written to stdin (never argv — Windows quoting + length limits)
```

Two spike items flagged for the phase (5-minute checks, not blockers): (a) whether `--agent fsb` can select an agent defined inline via `--agents` in the same invocation (documented composition is indirect; fallback is `--append-system-prompt-file`, which is fully documented); (b) exact `--tools ""` quoting on Windows.

Note the injected `--mcp-config` uses FSB's **existing streamable-HTTP endpoint (port 7226)** so the spawned CLI joins the already-running daemon/hub instead of forking a second stdio server process (which would spawn a competing hub and force relay promotion on 7225).

### 2. Codex CLI

**Verified against:** local `codex` **0.142.5** (`codex exec --help`, `codex mcp --help`, verbatim) + https://developers.openai.com/codex/noninteractive (→ redirects to learn.chatgpt.com/docs/non-interactive-mode) + config reference (learn.chatgpt.com/docs/config-file/config-reference), fetched 2026-07-10. npm latest: `@openai/codex` **0.144.1**. Confidence: **HIGH**.

| Capability | Flag (verbatim from 0.142.5 --help) | Notes |
|---|---|---|
| Headless run | `codex exec [PROMPT]` | Prompt as arg, or `-` / piped stdin ("If stdin is piped and a prompt is also provided, stdin is appended as a `<stdin>` block") |
| Streaming output | `--json` | "Print events to stdout as JSONL". Event types: `thread.started`, `turn.started`, `turn.completed`, `turn.failed`, `item.started`, `item.completed`; item types: `agent_message`, `reasoning`, `command_execution`, `mcp_tool_call`, `file_changes`, `web_search`, `plan_updates` |
| Final answer only | `-o, --output-last-message <FILE>` | Written to file, not stdout |
| Structured output | `--output-schema <FILE>` | JSON Schema for final response |
| Resume (chat-mode) | `codex exec resume <SESSION_ID>` / `codex exec resume --last "next instruction"` | Subcommand, not a flag |
| Ephemeral (task-mode) | `--ephemeral` | "Run without persisting session files to disk" — Codex's `--no-session-persistence` equivalent |
| Hermetic config | `--ignore-user-config` + `-c key=value` | "Do not load `$CODEX_HOME/config.toml`; **auth still uses `CODEX_HOME`**" — exactly the strict-MCP + subscription-auth combination FSB needs. `-c` takes dotted TOML paths, e.g. `-c 'mcp_servers.fsb.url="http://127.0.0.1:7226/mcp"'` |
| Profiles (alt hermetic path) | `-p, --profile <name>` | Layers `$CODEX_HOME/<name>.config.toml` on top of base config ("CONFIG_PROFILE_V2") — FSB could install a `fsb-delegation.config.toml` |
| Sandbox | `-s, --sandbox <read-only\|workspace-write\|danger-full-access>` | Default read-only. `--full-auto` is **deprecated** (docs: "prints warning; prefer --sandbox workspace-write") — do not emit it |
| Full bypass | `--dangerously-bypass-approvals-and-sandbox` | "EXTREMELY DANGEROUS" — never emit from FSB |
| Repo guard | `--skip-git-repo-check`, `-C, --cd <DIR>` | Needed: daemon scratch cwd is not a git repo |
| MCP config (persistent) | `[mcp_servers.<id>]` in `config.toml` | Keys verbatim: `command`, `args`, `cwd`, `env`, `enabled`, `startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, `disabled_tools`; HTTP servers: `url`, `http_headers`, `bearer_token_env_var`. `codex mcp list|get|add|remove|login|logout` exists (0.142.5) |
| Auth | ChatGPT login (subscription) by default; `CODEX_API_KEY` env only for CI | Matches key-less provider model |

**Drift alert (MEDIUM confidence):** current config reference lists `approval_policy` values as `"untrusted"`, `"on-request"`, `"never"` plus a granular object — `on-failure` (present in training-data-era docs) is no longer listed. Since `codex exec` is non-interactive, FSB's adapter should rely on sandbox mode, not approval_policy; re-verify if approval_policy is ever emitted.

### 3. Gemini CLI

**Verified against:** https://github.com/google-gemini/gemini-cli `docs/cli/cli-reference.md`, `docs/cli/headless.md`, `docs/tools/mcp-server.md` (main branch, fetched 2026-07-10). npm latest: `@google/gemini-cli` **0.50.0**. Not installed locally — no binary cross-check. Confidence: **MEDIUM-HIGH** (current official docs, single source class).

| Capability | Flag (verbatim from docs) | Notes |
|---|---|---|
| Headless run | `-p, --prompt` | "Appended to stdin input if provided. Forces non-interactive mode." Headless also triggers in non-TTY environments |
| Streaming output | `-o, --output-format stream-json` | Choices: `text`, `json`, `stream-json`. JSONL events: `init`, `message`, `tool_use`, `tool_result`, `error`, `result`. Exit codes: 0 success, 1 error, 42 input error, 53 turn-limit |
| Approval | `--approval-mode <default\|auto_edit\|yolo\|plan>` | `-y/--yolo` is **deprecated** ("Use --approval-mode=yolo instead") — do not emit `--yolo` |
| Tool allowlist | `--allowed-tools` **deprecated** ("Use the Policy Engine instead") | MCP-server-level gating is the supported path: `--allowed-mcp-server-names` (array) |
| Resume (chat-mode) | `-r, --resume <"latest"\|index>` | Plus `--list-sessions`, `--delete-session`. Resume support now exists (newer than training data) |
| MCP config | `mcpServers` in `~/.gemini/settings.json` or project `.gemini/settings.json` | Keys verbatim: `command`, `args`, `env`, `cwd`, `timeout` (ms, default 600000), `trust` (true "bypasses all tool call confirmations for this server"), `includeTools`, `excludeTools`; HTTP: `httpUrl` + `headers`; SSE: `url`. `gemini mcp add|list|remove|enable|disable` exists |
| Hermetic MCP | No per-invocation MCP flag | Achieve hermeticity by having the daemon own a scratch workspace dir containing `.gemini/settings.json` (project scope) + `--allowed-mcp-server-names fsb`; `trust: true` on the fsb entry to suppress per-tool confirmations |
| ACP | `--experimental-acp` | Alternative structured integration channel (see ACP note under OpenCode) |
| Model | `-m auto\|pro\|flash\|flash-lite` | |

### 4. OpenCode

**Verified against:** local `opencode` **1.14.25** (`opencode run --help`, verbatim) + https://opencode.ai/docs/cli/, /docs/mcp-servers/, /docs/agents/ (docs stamped "Last updated: Jul 10, 2026"). npm latest: `opencode-ai` **1.17.18**. Repo now lives at **anomalyco/opencode**. Confidence: **HIGH** for 1.14.25 flags, MEDIUM for renames in ≥1.15.

| Capability | Flag | Notes |
|---|---|---|
| Headless run | `opencode run [message..]` | Message as positional args |
| Streaming output | `--format json` | Choices verbatim: `"default", "json"` — json = "raw JSON events". Event schema is NOT formally documented — adapter must treat it as best-effort and pin against fixtures |
| Agent persona | `--agent <name>` | Selects agent by name |
| Agent definitions | `opencode.json` `"agent"` key, or markdown in `~/.config/opencode/agents/` / `.opencode/agents/` | Fields: `description`, `mode` (`primary`\|`subagent`\|`all`), `model` (`provider/model`), `prompt` (`{file:./path}` supported), `permission` (`allow`\|`ask`\|`deny` per tool: `read`,`edit`,`bash`,`webfetch`,…), `temperature`, `steps` (max iterations). `opencode agent create` = interactive generator |
| Resume (chat-mode) | `-c, --continue`, `-s, --session <id>`, `--fork` | |
| Permission bypass | 1.14.25: `--dangerously-skip-permissions` ("auto-approve permissions that are not explicitly denied (dangerous!)"); current docs list `--auto` with identical wording | **Rename in flight between 1.14.x and 1.17.x** — adapter must NOT hard-code either; prefer a shipped `fsb` agent with explicit `permission` config so no bypass flag is ever needed |
| MCP config | `opencode.json` / `opencode.jsonc` (project) or `~/.config/opencode/opencode.json` (global), `"mcp"` key | Local: `{"type":"local","command":["npx","-y","fsb-mcp-server"],"environment":{},"enabled":true,"timeout":5000}`; Remote: `{"type":"remote","url":"http://127.0.0.1:7226/mcp","headers":{},"enabled":true}`. Per-agent tool toggles support globs: `"tools": {"fsb*": true}` |
| Server modes | `opencode serve` (HTTP, `--port`/`--hostname`), `--attach <url>`, `opencode acp` (ACP over stdio JSON-RPC) | `--attach` lets `run` reuse a running server — cheap process reuse for repeat delegations |

**ACP note (applies to OpenCode + Gemini + future Zed-ecosystem agents):** both `opencode acp` and `gemini --experimental-acp` speak the Agent Client Protocol (JSON-RPC over stdio, zed.dev/acp). ACP is a *better long-term* delegation transport than scraping per-CLI JSONL (uniform session/permission/streaming semantics across agents), but it is the wrong MVP choice: Claude Code exposes no ACP server mode, and adding the `@zed-industries/agent-client-protocol` client library is a new dependency for adapters 2-4 only. Record it as the designated evolution path for the `AgentProviderAdapter` contract, not an MVP dependency.

---

## Recommended Stack

### Core Technologies (all built-in — zero new runtime deps)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:child_process` `spawn` | Node ≥18.20.0 (mcp/ engines floor, unchanged) | Spawn + supervise agent CLIs | Only primitive that gives streaming stdio + `AbortSignal` + `detached` process groups. `signal` option verified in official docs: abort ≈ `.kill()` with `killSignal` (default `'SIGTERM'`), child errors with `AbortError` |
| `node:readline` (`createInterface({ input: child.stdout, crlfDelay: Infinity })`) | built-in | JSONL line framing for all four CLIs' stream output | Handles partial lines across chunk boundaries; zero deps; volume (LLM event streams) is far below any throughput where a Transform-stream splitter would matter. Wrap each line in `try { JSON.parse } catch` — all four CLIs may interleave non-JSON warnings on stderr, and OpenCode's event schema is undocumented |
| `@modelcontextprotocol/sdk` (existing pin ^1.29) | 1.29.0 | Capture `clientInfo` from `initialize` | **Verified in the pinned tag's source** (`src/server/index.ts` @ v1.29.0): `Server._oninitialize` stores `request.params.clientInfo` (L441) and exposes `getClientVersion(): Implementation | undefined` (L463) + `oninitialized` callback (L144). For the `McpServer` wrapper used in `mcp/src/server.ts`, access via `mcpServer.server.getClientVersion()` after `oninitialized` fires. Zero new code paths on the wire — INV-01 safe |
| `node:fs` / `node:os` | built-in | Installed-client detection | `platforms.ts` already carries per-OS config paths for 21 clients; detection = existence/mtime sweep over that registry. No library needed |
| `ws` (existing pin ^8.19) | 8.19+ | Reverse-request channel extension→daemon | New **additive** message types over the existing 7225 bridge (INV-01: additive only). No new transport |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — (none recommended) | | | The supervisor is ~200-300 lines of deliberate code; every candidate lib below was evaluated and rejected for this footprint (see Alternatives) |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| Recorded JSONL fixtures per CLI (`tests/fixtures/agent-streams/`) | Contract tests for stream parsers | Record real `claude -p --output-format stream-json`, `codex exec --json`, `gemini -o stream-json`, `opencode run --format json` outputs once per adapter; parsers tested offline. Protects against the repo's source-pin-style CI without live CLI calls |
| `claude --version` / `codex --version` / etc. probes | Adapter `detect()` capability gating | Known-good baselines verified in this research: claude 2.1.177, codex 0.142.5, opencode 1.14.25; gemini 0.50.0 (npm latest, docs-verified only). Claude ≥2.1.205 additionally exposes a `capabilities` array in `system/init` — prefer feature-detection over version compares where available |

## Process Supervision Design Facts (verified from nodejs.org/api/child_process.html, 2026-07-10)

These verbatim-verified behaviors dictate the supervisor implementation; encode them as tests:

1. **Kill trees, POSIX:** `subprocess.kill()` does NOT kill grandchildren ("child processes of child processes will not be terminated when attempting to kill their parent"). Spawn with `detached: true` → child becomes "the leader of a new process group and session" → kill the whole tree with `process.kill(-child.pid, 'SIGTERM')`, escalate to `SIGKILL` after a ~5s grace. Do NOT call `subprocess.unref()` — the daemon must keep supervising.
2. **Kill trees, Windows:** negative-PID kill doesn't exist; `detached: true` gives the child "its own console window" instead. Use `spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'])` (no graceful tier on Windows). Set `windowsHide: true` explicitly (verified default: `false`).
3. **Kill switch wiring:** one `AbortController` per delegation; `spawn(..., { signal })`. Abort kills with `killSignal` (default `'SIGTERM'`) and surfaces `AbortError` on the child's `error` event — map that to the side panel's "stopped by user" state, distinct from crash.
4. **Backpressure:** verbatim — "These pipes have limited (and platform-specific) capacity. If the subprocess writes to stdout in excess of that limit without the output being consumed, the subprocess blocks". Therefore attach stdout AND stderr consumers synchronously at spawn; keep stderr in a bounded ring buffer (e.g. last 64KB) for `doctor` diagnostics.
5. **Exit sequencing:** `'exit'` can fire while stdio is still open; "The `'close'` event will always emit after `'exit'`". Resolve the delegation only on `'close'` so trailing `result` lines are never lost.
6. **Prompt transport:** always write the task prompt to **stdin** (all four CLIs accept it), never argv — avoids shell quoting entirely, Windows ~32KB command-line limits, and prompt leakage in process listings. Close stdin after writing (Claude/codex read to EOF), EXCEPT in Claude chat-mode with `--input-format stream-json` where stdin stays open for subsequent user turns.
7. **Windows `.cmd` shims:** npm-installed CLIs (`claude`, `gemini`, `codex` via npm) are `.cmd` shims on Windows; since Node 18.20/20.12 (CVE-2024-27980) `spawn("claude.cmd")` without `shell: true` throws `EINVAL`. Resolve the real entry (prefer detecting the native binary; fall back to `{ shell: true }` with a fully fixed argv — safe here only because the prompt travels via stdin, never through the shell string). Confidence: MEDIUM-HIGH (well-documented Node security release; exact per-CLI installer layout to confirm during the Windows adapter phase).
8. **Env hygiene:** spawn with a copied, scrubbed env — explicitly delete `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`/`CODEX_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY` from the child env. Presence of these silently flips CLIs from subscription auth to API-key billing, breaking the "key-less agent provider" contract (verified for Claude: `system/init`→`api_retry` `billing_error` category exists precisely for this failure class).
9. **Timeouts:** two-tier — wall-clock cap per delegation AND an idle watchdog (no JSONL event for N seconds → probe/kill). `--max-turns` (Claude) / `steps` (OpenCode agent config) / exit code 53 (Gemini turn limit) provide agent-side backstops; the daemon-side timer is authoritative.

## Claude Agent SDK vs. shelling to the CLI (explicit tradeoff)

**Decision: shell to the user's installed `claude` binary. Do not add `@anthropic-ai/claude-agent-sdk`.**

| Dimension | Shell to installed CLI | Embed `@anthropic-ai/claude-agent-sdk` (0.3.206) |
|---|---|---|
| Auth / billing | Uses whatever the user's CLI is logged in with — **Pro/Max subscription included**. This IS the product promise ("agent kind = no API key") | Docs verbatim (code.claude.com/docs/en/agent-sdk/overview, 2026-07-10): "Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods". API key / Bedrock / Vertex / Foundry only |
| Distribution weight | 0 bytes — binary already on the user's machine (that's what "installed client detected" means) | SDK "bundles a native Claude Code binary for your platform as an optional dependency" — a second full Claude Code shipped inside `fsb-mcp-server`'s npm install, version-skewed from the user's own |
| Multi-agent symmetry | Same `spawn + JSONL` supervisor pattern for all four CLIs → one `AgentProviderAdapter` contract | Claude-only; Codex/Gemini/OpenCode still need the spawn path anyway → two runtimes to maintain |
| Programmatic ergonomics | Parse documented stream-json; in-process `canUseTool`-style brokering only via `--permission-prompt-tool` MCP indirection | Native message objects, `canUseTool` callback, in-process MCP servers — genuinely nicer API |
| Branding/policy | FSB launches the user's own installed tool (config-writer precedent: `claude mcp add` delegation already ships in install.ts) | SDK products may not present as "Claude Code"; adds compliance surface |
| Update coupling | User updates their CLI; adapter feature-detects (`system/init.capabilities`) | FSB owns the pinned SDK version and its update cadence |

The ergonomics column is real but decisively outweighed: the SDK's auth policy alone disqualifies it for a feature whose definition is "use the subscription the user already pays for." If FSB ever wants an API-key-billed embedded execution path, that's what the existing `universal-provider.js` (7 providers) already is.

## Installation

```bash
# Runtime: nothing to install — Node built-ins + existing deps only.

# mcp/ package: new modules, no package.json dependency changes
#   mcp/src/agents/supervisor.ts      (spawn/kill-tree/watchdog, ~200 lines)
#   mcp/src/agents/adapters/*.ts      (claude.ts first; codex/gemini/opencode later)
#   mcp/src/agents/stream-parsers.ts  (per-CLI JSONL event normalization)
#   + additive WS message types in bridge.ts / agent-bridge.ts

# Dev only: recorded stream fixtures under tests/fixtures/agent-streams/
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Hand-rolled supervisor on `spawn` | `execa` 9.6.1 | If mcp/ ever grows many ad-hoc script invocations where its `cleanup`/template ergonomics pay off. For ONE long-lived supervised child shape it adds deps to a published npm package without solving tree-kill on POSIX (it also only signals the direct child) |
| `detached` + `kill(-pid)` / `taskkill /T` | `tree-kill` 1.2.2 | If FSB cannot use `detached: true` (e.g. a CLI misbehaves as a session leader). tree-kill walks `ps`/`pgrep` output — race-prone vs. atomic process-group kill; keep as fallback knowledge, not a dep |
| `node:readline` line framing | `split2` 4.2.0 | If a future stream needs true Transform-stream backpressure into a pipeline. Current consumer (WS fan-out to side panel) is push-based; readline suffices |
| Per-CLI JSONL adapters (MVP) | ACP client (`@zed-industries/agent-client-protocol`) via `opencode acp` / `gemini --experimental-acp` | Adapter v2, once ≥2 non-Claude agents are in scope — uniform protocol beats N bespoke parsers, but Claude Code (the MVP) doesn't speak it |
| `claude --resume` respawn per turn (chat-mode) | Persistent child with `--input-format stream-json` + `--output-format stream-json` | If per-turn respawn latency (CLI cold start) proves unacceptable in the side panel. More capable but adds lifetime management (idle child, SW-eviction interplay); benchmark before committing |
| Claude Code via its own CLI | `claude --permission-prompt-tool mcp__fsb__<approval-tool>` consent brokering | Later consent-tier phase: lets FSB surface CLI permission asks in the side panel instead of blanket `dontAsk` denial |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@anthropic-ai/claude-agent-sdk` | Policy-prohibited subscription auth for third-party products; bundles a duplicate CC binary; Claude-only | Spawn the user's installed `claude` (tradeoff table above) |
| `node-pty` (or any PTY layer) | All four CLIs have first-class non-interactive modes with clean piped stdio; PTY adds native-build deps to a published npm package and ANSI-garbage parsing | `spawn` with `stdio: ['pipe','pipe','pipe']` |
| `child_process.exec` / `execFile` for delegation | Buffers output until exit (`maxBuffer` kills long streams); no streaming | `spawn` + readline |
| `--dangerously-skip-permissions` (Claude), `--dangerously-bypass-approvals-and-sandbox` (Codex), `--approval-mode=yolo` (Gemini), `--auto`/`--dangerously-skip-permissions` (OpenCode) | Blanket bypass on a channel that is already RCE-adjacent; violates the milestone's "strict permission defaults, explicit consent tiers" | Claude: `--permission-mode dontAsk` + `--allowedTools "mcp__fsb"`; Codex: default `read-only` sandbox; Gemini: `--allowed-mcp-server-names fsb` + `trust` on the fsb server only; OpenCode: shipped agent `permission` map |
| `--bare` (Claude) | Skips OAuth/keychain → breaks subscription auth | `--strict-mcp-config` + `--agents` + explicit flags for hermeticity |
| Deprecated flags: `--full-auto` (Codex), `-y/--yolo` and `--allowed-tools` (Gemini) | Verified deprecated in current docs; emit warnings today, removal risk tomorrow | Current equivalents listed in the matrices |
| Pinning agent CLI versions in FSB | User-owned binaries update on their own cadence | `detect()` = version probe + capability gate (+ `system/init.capabilities` for Claude ≥2.1.205); fixtures pin the parser contract, not the binary |

## Stack Patterns by Variant

**Task-mode (MVP, per-delegation spawn):**
- Claude: `-p` + `--no-session-persistence` + stdin prompt; Codex: `codex exec --ephemeral`; ephemeral = no session litter in the user's CLI history.

**Chat-mode (where supported):**
- Claude: omit `--no-session-persistence`, capture `session_id` from `system/init`/`result`, respawn with `--resume <id>` — **must reuse the same daemon-owned cwd** (session lookup is directory-scoped, verified). Codex: `codex exec resume <id>`. Gemini: `-r <index|"latest">` (weaker: index-based). OpenCode: `-s <session-id>`.

**If the user's Claude ≥2.1.205:** read `system/init.capabilities` for feature detection instead of version parsing.

**If delegation target is OpenCode with a running server:** prefer `opencode run --attach http://localhost:<port>` over cold spawn.

## Version Compatibility

| Package/Binary | Compatible With | Notes |
|-----------|-----------------|-------|
| mcp/ `engines.node >=18.20.0` | All recommended built-ins | `spawn` `signal` (15.5+), `readline` promises (17+), `.cmd` EINVAL behavior starts exactly at 18.20 — floor unchanged, no bump needed |
| `@modelcontextprotocol/sdk` ^1.29 | `getClientVersion()` / `oninitialized` | Verified present in tag v1.29.0 source; note upstream repo `main` is now a v2 monorepo (`packages/server/src/server/server.ts` keeps the same accessor) — pin stays on 1.x |
| claude 2.1.177 (local baseline) | All matrix-1 flags | `manual` permission-mode alias needs ≥2.1.200; `capabilities` array needs ≥2.1.205 |
| codex 0.142.5 (local baseline) / npm 0.144.1 | All matrix-2 flags | `--ephemeral`, `--ignore-user-config`, `-c` overrides all present at 0.142.5 |
| opencode 1.14.25 (local) vs 1.17.18 (npm) | `run --format json`, `--agent`, sessions | Permission-bypass flag renamed between these versions (`--dangerously-skip-permissions` → docs' `--auto`) — adapter avoids both |
| gemini 0.50.0 (npm latest) | Matrix-3 flags | Docs-verified only; no local binary — first Gemini adapter phase must start with a live `--help` capture |

## Sources

- Local binaries (strongest evidence, run 2026-07-10): `claude --help` @ 2.1.177; `codex exec --help` + `codex mcp --help` @ 0.142.5; `opencode run --help` @ 1.14.25 — all flags quoted verbatim
- https://code.claude.com/docs/en/cli-reference — full flag list incl. `--agents` fields, `--tools`, `--permission-mode` values (HIGH)
- https://code.claude.com/docs/en/headless — stream-json event contract, `system/init` capabilities, `--bare` auth caveat, resume cwd-scoping, 10MB stdin cap (HIGH)
- https://code.claude.com/docs/en/permissions — MCP rule syntax `mcp__server` / `mcp__server__*` / anchored allow-globs, verbatim (HIGH)
- https://code.claude.com/docs/en/agent-sdk/overview — SDK auth policy quote, bundled-binary note, branding rules (HIGH)
- https://code.claude.com/docs/en/sub-agents — `--agents` JSON full field list, scope precedence (HIGH)
- Codex non-interactive docs: developers.openai.com/codex/noninteractive → learn.chatgpt.com/docs/non-interactive-mode; config: learn.chatgpt.com/docs/config-file/config-reference (fetched 2026-07-10) — JSONL events, resume, deprecated `--full-auto`, `[mcp_servers]` keys, approval_policy drift (HIGH for exec flags via local binary; MEDIUM for approval_policy set)
- google-gemini/gemini-cli `docs/cli/cli-reference.md`, `docs/cli/headless.md`, `docs/tools/mcp-server.md` @ main, 2026-07-10 (MEDIUM-HIGH; no local binary)
- https://opencode.ai/docs/cli/ + /docs/mcp-servers/ + /docs/agents/ (page-stamped "Jul 10, 2026") + [anomalyco/opencode issue #8463](https://github.com/anomalyco/opencode/issues/8463) / [#23370](https://github.com/anomalyco/opencode/issues/23370) re: bypass-flag naming (HIGH for 1.14.25 via local binary)
- OpenCode ACP: https://opencode.ai/docs/acp/ + https://zed.dev/acp/agent/opencode + https://zed.dev/acp (MEDIUM-HIGH)
- modelcontextprotocol/typescript-sdk tag v1.29.0 `src/server/index.ts` L135/L144/L441/L456-465 — `clientInfo` storage + `getClientVersion()` verified at the exact pinned version (HIGH)
- https://nodejs.org/api/child_process.html — detached/process-group, kill-tree limitation, AbortSignal, killSignal default, windowsHide default false, exit-vs-close, pipe backpressure block, shell warning, maxBuffer scope — all quoted verbatim (HIGH)
- npm registry (`npm view`, 2026-07-10): @anthropic-ai/claude-agent-sdk 0.3.206, @google/gemini-cli 0.50.0, opencode-ai 1.17.18, @openai/codex 0.144.1, tree-kill 1.2.2, execa 9.6.1, split2 4.2.0 (HIGH)

---
*Stack research for: v0.9.91 MCP Clients as Providers — agent-CLI spawning, supervision, and stream parsing*
*Researched: 2026-07-10*
