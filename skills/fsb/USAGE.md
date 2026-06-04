# FSB Skill -- Usage

> **v0.9.0 breaking change** -- The explicit `start_visual_session` / `end_visual_session` tools were REMOVED in fsb-mcp-server v0.9.0 (FSB milestone v0.9.62). Action tools now require `visual_reason` + `client` fields in every call (validated against the v0.9.36 badge allowlist). The visual session is created implicitly on the first action call, refreshed on a sliding 60-second window, and cleared by `is_final: true` (immediate) or 60 seconds of silence (auto-clear). Calling the removed tools returns the typed `TOOL_REMOVED` error. See [`mcp/CHANGELOG.md`](../../mcp/CHANGELOG.md#v0.9.0) and [`mcp/README.md`](../../mcp/README.md#visual-session-lifecycle) for the migration recipe with concrete before/after code.

FSB drives the user's real Chrome via the FSB extension and a local MCP bridge so OpenClaw can run live web tasks (clicks, typing, multi-tab flows, auth-gated reads).

## Who FSB is for

FSB is for tasks that need a real browser session: clicking buttons, typing into forms, multi-tab orchestration, logged-in reads, vault-backed credentials, or anything that depends on live page state rendered after JavaScript. If a request mentions a real website and a user action, prefer FSB tools.

The carve-out: public-doc reads, JSON endpoints, and RSS feeds that do not require interaction can stay on WebFetch (see `references/default-to-fsb.md`). Everything else -- click, type, auth, multi-tab, dynamic content -- belongs on FSB.

The goal of this page: get a new user from a clean machine to a green doctor in under five minutes.

## Install (3 steps)

1. **Install the FSB Chrome extension.**

   Primary path -- Chrome Web Store. Paste this URL into Chrome's address bar and click `Add to Chrome`:

   ```
   https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk
   ```

   Fallback path -- GitHub Releases. If the Web Store listing is unavailable in your region, download the latest `.zip` from the releases page, unzip it, then load it unpacked at `chrome://extensions` with `Developer mode` toggled on:

   ```
   https://github.com/fullselfbrowsing/FSB/releases
   ```

   This skill prints the URL for the user to click. It does NOT auto-launch the browser to that URL.

2. **Install the FSB MCP server config.**

   Print the canonical OpenClaw stdio block and paste it into your MCP host config, then restart the host:

   ```
   node scripts/print-stdio.mjs
   ```

   To discover other supported hosts on the machine (Claude Desktop, Cursor, etc.), run:

   ```
   npx -y fsb-mcp-server install --list
   ```

   Then run the host-specific installer, for example:

   ```
   npx -y fsb-mcp-server install --claude-desktop
   ```

   Notes:
   - What these commands do: each invocation spawns the `fsb-mcp-server` Node package via npx. `install --list` only prints detected MCP hosts and exits. `install --<host>` writes the FSB stdio block into that host's MCP config file and nothing else. Run only the host installers you actually want configured; decline prompts otherwise.
   - By default, `npx -y fsb-mcp-server` resolves to the latest published bridge so security fixes ship without re-running the installer. If you prefer review-before-upgrade, pin a release by replacing `fsb-mcp-server` with `fsb-mcp-server@x.y.z` (see releases at `https://www.npmjs.com/package/fsb-mcp-server`) in the stdio block printed by `node scripts/print-stdio.mjs` and in any host-specific install command. The bridge accepts the same arguments either way.
   - Zero environment variables are needed. Vault values (passwords, payment methods) resolve inside the FSB Chrome extension's encrypted storage and never cross into the MCP server process or the OpenClaw host process. See `references/vault-boundary.md` for the boundary rules.

3. **Verify with the doctor.**

   ```
   node scripts/doctor.mjs
   ```

   Expect six `[OK]` lines, one per layer (`package`, `bridge`, `extension`, `active-tab`, `content-script`, `config`). If any layer prints `[FAIL]`, jump to the recovery table below in the section "Recover when the doctor fails".

## Try it

Once the doctor is green, paste any of these into your OpenClaw chat to confirm the loop works.

### Manual mode (default)

Manual-mode prompts are the default entry point. Each one calls a single FSB tool so you can see the round-trip plainly.

- Exercise `read_page`: "Open https://example.com and read the page. Summarize the visible text in two sentences."
- Exercise `click`: "On https://example.com, click the 'More information...' link and tell me what page loads."
- Exercise `type_text`: "Open https://duckduckgo.com, type `fsb-mcp-server` into the search box, and press Enter. Then list the first three result titles."

### Autopilot (explicit delegation only)

NEVER call `run_task` (autopilot) unless the user has explicitly said something like "use FSB autopilot", "delegate this to FSB", "run the whole task autonomously", or named `run_task` directly. Manual mode tools (`read_page`, `click`, `type_text`, `press_enter`, etc.) are the default for everything else, including tasks with many steps. If the user has not asked for autopilot, drive each step yourself with manual mode tools and observe the result before the next step.

When the user does explicitly delegate, autopilot hands the full plan and execute loop to FSB. Example invocation:

- Exercise `run_task`: "Use FSB autopilot to find the first GitHub repo for `fsb-mcp-server` and report a one paragraph summary of its README."

Autopilot is NOT the default entry point. Read the user's message again before reaching for `run_task`. If delegation language is missing, stay in manual mode.

## v0.9.62 visual-session contract

FSB shows a trusted client badge and an orange element targeting overlay on the user's tab while a tool sequence is running, so the user can see what is being driven. OpenClaw is a trusted client. As of fsb-mcp-server v0.9.0 (milestone v0.9.62) the visual session is IMPLICIT: every action tool call carries the field bundle (`visual_reason`, `client`, optional `is_final`), and the lifecycle is driven by those fields alone. There is no `start_visual_session` / `end_visual_session` pairing to write.

Three rules govern the bundle:

- **`visual_reason`** -- short human-readable string shown in the overlay (for example, `"Completing checkout"`). Required on every action tool call.
- **`client`** -- allowlisted badge label. Required on every action tool call. The shared v0.9.36 allowlist accepts: `Claude`, `Codex`, `ChatGPT`, `Perplexity`, `Windsurf`, `Cursor`, `Antigravity`, `OpenCode`, `OpenClaw`, `Grok`, `Gemini`. Freeform strings reject with `BADGE_NOT_ALLOWED`. The skill ships as part of OpenClaw, so the canonical `client` value for this surface is `OpenClaw`.
- **`is_final`** -- optional boolean. Set `true` on the LAST action of a task to clear the overlay immediately after that action's `change_report` resolves. Default `false`.

Read-only tools (`read_page`, `get_dom_snapshot`, `get_text`, `get_attribute`, `read_sheet`, `get_page_snapshot`, `list_tabs`, `get_site_guide`, `search_memory`, `report_progress`, `complete_task`, `partial_task`, `fail_task`, `wait_for_element`, `wait_for_stable`) do NOT carry the bundle and do NOT re-arm the sliding window. Reads stay silent by design.

### Example 1 -- action call with the implicit visual session

```
mcp> click({ selector: "#submit", visual_reason: "Completing checkout", client: "OpenClaw" })
```

The overlay glow appears on the active tab with the supplied reason. Subsequent action calls within 60 seconds re-arm the death timer (sliding window). After 60 seconds of silence, the overlay clears automatically.

### Example 2 -- final action of a task (is_final clear)

```
mcp> click({ selector: "#confirm-order", visual_reason: "Confirming order", client: "OpenClaw", is_final: true })
```

The overlay clears immediately after the underlying click completes -- no 60-second wait.

### Typed errors

Three typed errors guard the contract; match on the name, not the human-readable body:

- **`VISUAL_FIELDS_REQUIRED`** -- raised when an action call is missing `visual_reason` or `client`. Schema-layer reject; no DOM mutation occurs.
- **`BADGE_NOT_ALLOWED`** -- raised when `client` is not on the v0.9.36 allowlist. Use one of the labels above.
- **`TOOL_REMOVED`** -- raised when a caller invokes `start_visual_session` or `end_visual_session` by name. The body names the new contract; do not retry with the removed tool names.

### Autopilot exception

If `run_task` (autopilot) is being used, autopilot manages its own internal visual-session lifecycle and is NOT affected by the v0.9.0 implicit-contract change. Do NOT wrap a `run_task` call in your own field-bundle plumbing.

For lifecycle details, the sliding-window mechanics, the read-tool vs action-tool split, and the `NO_OWNED_TAB` bootstrap, see `references/visual-session-lifecycle.md`. The canonical action-tool list (36 tools), the read-only list (15 tools), and the typed-error catalogue live in `.planning/v0.9.62-CONTRACT.md`.

## Recover when the doctor fails

Each `[FAIL]` from `node scripts/doctor.mjs` maps to one of six layers. Find your symptom in the table below, run the action, and re-run the doctor until you see all six layers green.

| Layer | What it means | What to do |
| --- | --- | --- |
| package | npm cannot fetch `fsb-mcp-server`. | Run `npx -y fsb-mcp-server --version` to confirm npm can reach the package. If that fails, check Node 18+ is installed and on PATH. |
| bridge | The extension is not running, or `ws://localhost:7225` is not reachable. | Start the FSB extension (open Chrome with the extension installed) and run `npx -y fsb-mcp-server status --watch` to confirm `ws://localhost:7225` is reachable. |
| extension | The FSB Chrome extension is not installed. | Install from `https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk` (fallback: GitHub Releases at `https://github.com/fullselfbrowsing/FSB/releases`), then reopen this session. |
| active-tab | The active tab is restricted (`chrome://`, `edge://`, the Web Store) or no tab is owned by the agent. | Open a normal `http(s)` tab (not `chrome://`, `edge://`, or the Web Store) and run `npx -y fsb-mcp-server status --watch` to re-attach. See `references/restricted-tab-recovery.md` for the recovery toolset. |
| content-script | The content script did not attach (extension installed after the tab loaded). | Reload the active tab. The FSB content script attaches on page load; reloads after extension install are required. |
| config | The MCP host config does not include the FSB stdio block. | Re-run `npx -y fsb-mcp-server install --<host>` for your MCP host (replace `<host>` with `claude-desktop`, `cursor`, etc.). Or paste the block printed by `node scripts/print-stdio.mjs` into your host config. |

Re-run `node scripts/doctor.mjs` after each fix. If a layer keeps flipping or you see `[WARN]`, capture the raw output and file an issue at `https://github.com/fullselfbrowsing/FSB/issues`.
