# Visual session lifecycle (v0.9.62)

As of fsb-mcp-server v0.9.0 (FSB milestone v0.9.62) the visual session is IMPLICIT. There is no `start_visual_session` / `end_visual_session` pairing. Every action tool call carries a field bundle, and the lifecycle is driven by those fields alone. This file documents the bundle, the sliding 60-second window, the read-tool vs action-tool split, and the bootstrap path.

If you arrived here from v0.8.0 / v0.9.36 docs that documented an explicit start/end pairing, that pairing was removed in v0.9.0. Calling the removed tools returns the typed `TOOL_REMOVED` error -- the body names the new contract and points at the migration recipe in `mcp/CHANGELOG.md` v0.9.0.

## The field bundle

Every MCP action tool accepts and requires the following fields on every call:

| Field           | Type    | Required | Description                                                                                          |
|-----------------|---------|----------|------------------------------------------------------------------------------------------------------|
| `visual_reason` | string  | required | Short human-readable reason shown in the overlay (for example, `"Logging in to GitHub"`).            |
| `client`        | string  | required | Allowlisted client label. Validated against the v0.9.36 shared badge allowlist (see below).          |
| `is_final`      | boolean | optional | When `true`, the overlay clears immediately after the tool's `change_report` resolves. Default `false`. |

Allowlisted `client` values (v0.9.36 shared allowlist): `Claude`, `Codex`, `ChatGPT`, `Perplexity`, `Windsurf`, `Cursor`, `Antigravity`, `OpenCode`, `OpenClaw`, `Grok`, `Gemini`. The skill ships as part of OpenClaw, so the canonical `client` value for this surface is `OpenClaw`. Freeform strings reject with `BADGE_NOT_ALLOWED`.

The canonical 36-tool action list lives in `.planning/v0.9.62-CONTRACT.md` (Action Tools section). The 15-tool read-only list lives in the same file (Read-Only Tools section). Do not re-derive either list from memory.

## Implicit start

The first action tool call on a tab creates the visual session. The extension paints the overlay using the supplied `visual_reason` and the badge corresponding to `client`. There is no separate open call -- the bundle on the action call IS the open.

```
mcp> click({ selector: "#submit", visual_reason: "Completing checkout", client: "OpenClaw" })
```

When this call dispatches, the overlay appears with `"Completing checkout"` and the OpenClaw badge. The death-timer is armed at 60 seconds.

## Sliding 60-second window

Each subsequent action tool call on the same tab re-arms the 60-second death timer (sliding window). The overlay stays alive as long as action calls keep arriving within 60 seconds of each other.

```
mcp> click({ selector: "#step-1", visual_reason: "Completing checkout", client: "OpenClaw" })
mcp> type_text({ selector: "#email", text: "user@example.com", visual_reason: "Completing checkout", client: "OpenClaw" })
mcp> click({ selector: "#continue", visual_reason: "Completing checkout", client: "OpenClaw" })
```

Each call here re-arms the timer to 60 seconds from its own dispatch. If 60 seconds pass with no further action call, the overlay auto-clears -- no explicit end call is required.

Callers may repeat the same `visual_reason` across the sequence (as above) or vary it per call to surface step-level overlay text to the user. The `client` value MUST stay on the v0.9.36 allowlist for the whole sequence; cross-client switching on the same tab still rejects with the existing `TAB_NOT_OWNED` ownership gate from v0.9.60.

## Immediate clear with is_final

Set `is_final: true` on the LAST action of a task to clear the overlay immediately after that action's `change_report` resolves -- no 60-second wait.

```
mcp> click({ selector: "#confirm-order", visual_reason: "Confirming order", client: "OpenClaw", is_final: true })
```

`is_final` is the explicit task-completion signal. Use it whenever the task ends on an action call; otherwise the overlay sits for up to 60 seconds before the auto-clear fires. The two clear paths are mutually compatible -- whichever fires first wins. If `is_final` is omitted on the last action and no further action calls follow, the auto-clear fires after 60 seconds of silence.

## Read tools do NOT carry the bundle

Read-only MCP tools (`read_page`, `get_dom_snapshot`, `get_text`, `get_attribute`, `read_sheet`, `get_page_snapshot`, `list_tabs`, `get_site_guide`, `search_memory`, `report_progress`, `complete_task`, `partial_task`, `fail_task`, `wait_for_element`, `wait_for_stable`) do NOT accept `visual_reason`, `client`, or `is_final`. Reads stay silent by design: they do not bring up the overlay, they do not re-arm the sliding window, and they do not clear the overlay.

Concrete contrast -- action tool WITH bundle vs read tool WITHOUT:

```
[ACTION] click({ selector: "#open-menu", visual_reason: "Browsing settings", client: "OpenClaw" })
[READ]   read_page({})
```

The action call brings up (or re-arms) the overlay. The read call slips through silently and does not touch the visual-session state. This split is enforced at the MCP server's schema layer; passing the bundle to a read tool is a schema-layer reject before any work runs.

## Bootstrap: NO_OWNED_TAB

The new contract still goes through the v0.9.60 ownership gate. On the very first call of a fresh agent session there is no owned tab, so an action call rejects with `NO_OWNED_TAB`. Recover by opening a tab first:

```
list_tabs({})                                  // optional: see if anything is already owned
open_tab({ url: "<target>", active: false })   // claim a tab without stealing user focus
click({ selector: "#submit", visual_reason: "...", client: "OpenClaw" })   // now succeeds
```

`open_tab` is itself an action tool, so it also carries the bundle on its call (the `open_tab` call brings up the overlay on the newly opened tab once the page loads enough for the content script to attach).

## Typed errors

Three typed errors guard the contract. Match on the name, not the human-readable body:

| Error                     | Condition                                                                 | Recovery                                                                                              |
|---------------------------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| `VISUAL_FIELDS_REQUIRED`  | Action call missing `visual_reason` or `client`.                          | Add the missing field(s) and retry. Schema-layer reject; no DOM mutation occurs.                      |
| `BADGE_NOT_ALLOWED`       | `client` value not on the v0.9.36 allowlist.                              | Use one of the allowlisted labels listed above (`OpenClaw` for this skill) and retry.                  |
| `TOOL_REMOVED`            | Caller invoked `start_visual_session` or `end_visual_session` by name.    | Stop calling the removed tools. Migrate to the field bundle on action calls. See migration recipe.    |

The three error names are pinned by `.planning/v0.9.62-CONTRACT.md` and stay verbatim across surfaces.

## Autopilot exception

If `run_task` (autopilot) is being used, autopilot manages its own internal visual-session lifecycle and is NOT affected by the v0.9.0 implicit-contract change. Do NOT pass field-bundle plumbing through `run_task`. Drive autopilot only when the user explicitly delegates the whole task.

## MV3 service-worker eviction

The sliding-window state is persisted in `chrome.storage.session` and replayed on service-worker wake; the death-timer deadline survives eviction via the v0.9.36 visual-session persistence pattern. Callers do not need to do anything to handle eviction -- the bridge reconciles automatically on reconnect.

## See also

- `USAGE.md` -- "v0.9.62 visual-session contract" section with the user-facing summary.
- `SKILL.md` -- canonical list pointers (action tools / read-only tools / typed errors).
- `references/multi-agent-contract.md` -- ownership errors (`NO_OWNED_TAB`, `TAB_NOT_OWNED`, etc.) that fire before the visual-session lifecycle.
- `references/tool-decision-tree.md` -- which tool to pick first; per-branch field-bundle reminders.
- `.planning/v0.9.62-CONTRACT.md` -- canonical 36 action tools, 15 read-only tools, three typed-error names.
- `mcp/CHANGELOG.md` v0.9.0 -- migration recipe with concrete before/after code.
