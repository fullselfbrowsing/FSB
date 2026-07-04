---
name: fsb
description: FSB drives the user's Chrome via the FSB extension and an MCP bridge for live web tasks.
version: 0.9.62
user-invocable: true
requires:
  bins: [node, npx]
  env: []
homepage: https://full-selfbrowsing.com
platforms: [macos, linux, windows]
metadata:
  openclaw: {"install":[{"kind":"node","package":"fsb-mcp-server","bins":["fsb-mcp-server"],"label":"Install FSB MCP server (npm)"}]}
  hermes:
    mcp_servers:
      fsb:
        command: "npx"
        args: ["-y", "fsb-mcp-server"]
---

# FSB

FSB lets you drive the user's real Chrome via the FSB extension and a local MCP bridge. Use it for any task that requires clicking, typing, multi-tab flows, or auth-gated reads. Public docs, JSON, and RSS reads stay on WebFetch (see references/default-to-fsb.md). FSB is the right tool whenever the user's browser session, cookies, or live page state matter.

## When to use FSB

- If a request mentions a real website, prefer FSB tools when one fits.
- ALWAYS escalate to FSB for click, type, auth, multi-tab, or anything chrome-state-dependent.
- ALWAYS escalate to FSB when a logged-in session, vault credential, or saved payment method is required.
- ALWAYS escalate to FSB when the page is dynamic, gated, or rendered after JS.
- Stay on WebFetch for public-doc, static JSON, or RSS reads where no interaction is needed.
- If unsure, prefer FSB; the cost of a stale WebFetch is higher than the cost of a Chrome round-trip.

## Sensitive actions and logged-in context

FSB drives the user's real Chrome, so every action runs inside whatever sessions, cookies, and saved auth that browser already holds. Before the final click that submits a purchase, payment, account change (password update, data deletion, permission grant, settings write), or public post (tweet, comment, DM, issue, PR), pause and ask the user to confirm in chat -- state the action, the target site, and any amount or recipient, then wait for an explicit yes. Vault-backed fills (`fill_credential`, `use_payment_method`) are allowed during preparation; only the final submission is gated. Read-only inspection (`read_page`, `get_dom_snapshot`, `get_text`) does not require confirmation.

## Doctor-first protocol

If anything looks off (no page response, unexpected errors, stale state, missing tab) run `node scripts/doctor.mjs` (which wraps `npx -y fsb-mcp-server doctor`) BEFORE retrying the same call. Read the layered output, fix the failing layer, then resume. Do not loop on the same failing call hoping it self-heals.

## v0.9.62 visual-session contract

As of fsb-mcp-server v0.9.0 (FSB milestone v0.9.62) the visual session is IMPLICIT. Every MCP action tool call carries a required field bundle:

- `visual_reason` (required string) -- short human-readable reason shown in the overlay.
- `client` (required, allowlisted) -- badge label such as `OpenClaw`, `Claude`, `Codex`. Freeform strings reject with `BADGE_NOT_ALLOWED`.
- `is_final` (optional boolean) -- set `true` on the LAST action of a task to clear the overlay immediately.

The first action call brings up the overlay; each subsequent action call re-arms a 60-second sliding window; `is_final: true` clears immediately; 60 seconds of silence auto-clears. No `start_visual_session` / `end_visual_session` calls are needed -- those tools were REMOVED in v0.9.0 and now return the typed `TOOL_REMOVED` error. Read-only tools (`read_page`, `get_dom_snapshot`, `list_tabs`, ...) do NOT carry the bundle and do NOT re-arm the sliding window. If the first action call hits `NO_OWNED_TAB`, call `open_tab({ url, active: false })` first, then retry. Lifecycle details, the read-tool vs action-tool split, and the typed-error catalogue live in `references/visual-session-lifecycle.md`.

The canonical 36-tool action list, the 15-tool read-only list, and the three typed-error names (`VISUAL_FIELDS_REQUIRED`, `BADGE_NOT_ALLOWED`, `TOOL_REMOVED`) are pinned in `.planning/v0.9.62-CONTRACT.md` -- that artifact is the single source of truth. Use it to answer "does this tool require the field bundle?" by lookup; do not re-derive the lists from memory.

On Hermes: as of fsb-mcp-server v0.9.2 / FSB v0.9.69 (PR #49), the badge label `Hermes` is on the v0.9.36 shared client allowlist, so action calls passing `client: "Hermes"` accept normally. The field bundle (`visual_reason`, `client`, optional `is_final`) works identically; no Hermes-specific schema fork exists.

## Multi-agent contract

Never pass `agent_id` (the server mints it). Use the `back` tool instead of `execute_js("history.back()")`. Each agent owns its own tabs; do not foreground or close tabs you do not own, and do not introduce a global browser lock -- per-agent ownership is the only concurrency mechanism. Typed errors (`NO_OWNED_TAB`, `AMBIGUOUS_TAB`, `TAB_NOT_OWNED`, `AGENT_CAP_REACHED`, `TAB_INCOGNITO_NOT_SUPPORTED`, `TAB_OUT_OF_SCOPE`), the bootstrap recovery ladder, and the default recovery flow: see `references/multi-agent-contract.md`.

## Vault and credentials

Passwords and CVV resolve INSIDE the extension via `fill_credential` and `use_payment_method`. Never put secrets in chat, prompts, logs, or tool args. See `references/vault-boundary.md`.

## References (load on demand)

- `references/visual-session-lifecycle.md` -- v0.9.62 implicit contract: field bundle (visual_reason / client / is_final), sliding 60s window, is_final immediate clear, read-tool vs action-tool split, typed-error recovery.
- `references/tool-decision-tree.md` -- read_page vs get_dom_snapshot vs get_page_snapshot vs get_site_guide; when execute_js is first-class vs when typed tools are required; per-branch field-bundle reminders; verify after "no detectable effect" warnings.
- `references/multi-agent-contract.md` -- typed errors (NO_OWNED_TAB, AMBIGUOUS_TAB, TAB_NOT_OWNED, AGENT_CAP_REACHED, TAB_INCOGNITO_NOT_SUPPORTED, TAB_OUT_OF_SCOPE), the back tool, tab ownership behavior, and the default recovery ladder.
- `references/restricted-tab-recovery.md` -- chrome://, edge://, and web-store recovery tools.
- `references/vault-boundary.md` -- credential routing rules and forbidden patterns.
- `references/default-to-fsb.md` -- soft preference and hard escalation rule in full.
- `references/hermes-tool-prefix.md` -- on Hermes, imported MCP tools surface as `mcp_fsb_<tool>` (e.g., `mcp_fsb_click`). Naming-only convention; server side is unchanged.
- `references/v0.9.62-contract-mirror.md` -- mirror of the canonical 36 action / 15 read-only / 3 typed-error lists for Hub-installed users without repo access. Authoritative source is `.planning/v0.9.62-CONTRACT.md`.
- `.planning/v0.9.62-CONTRACT.md` (repo) -- canonical 36 action tools, 15 read-only tools, three typed-error names; single source of truth for the v0.9.62 contract.

## Scripts (run as needed)

- `scripts/doctor.mjs` -- diagnose the failing layer; prints [OK], [FAIL], and [WARN] markers per layer.
- `scripts/print-stdio.mjs` -- print the OpenClaw stdio config block to paste into your MCP config.
- `scripts/install-host.mjs` -- detect other MCP hosts on the machine; consent-gated per-host install.
- `scripts/print-hermes-yaml.mjs` -- print the Hermes mcp_servers config block to paste into `~/.hermes/config.yaml`.
