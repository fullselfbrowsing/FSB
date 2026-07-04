# Restricted-tab recovery

When FSB's active tab is at a restricted URL, the FSB content script cannot attach. DOM tools (`read_page`, `get_dom_snapshot`, `click`, `type_text`, etc.) will fail. The full non-injectable list:

- `chrome://*`, `edge://*`, `about:*`, `view-source:*`
- `https://chrome.google.com/webstore/*`, `https://chromewebstore.google.com/*`
- `data:` URLs (no origin -- the extension cannot register a host match)
- `file:` URLs (unless the user has manually granted file-URL access to the extension)
- `blob:` URLs spawned in restricted contexts

This file lists the recovery toolset that works even on these tabs and shows the standard bootstrap recovery sequence.

## Why DOM tools fail on these URLs

Browsers forbid content scripts from attaching to internal pages, the Chrome Web Store, and origin-less schemes (`data:`, `file:`, certain `blob:`) as a security boundary. The Manifest V3 `host_permissions` list cannot match them; Chrome rejects the injection at the policy layer. There is no extension-side workaround -- the boundary is enforced by the browser itself, before any of FSB's code runs.

For local testing, serve the page over `http://localhost` instead of opening a `data:` or `file:` URL.

Without a content script, the FSB extension cannot read the DOM, dispatch typed events, or observe mutations. Any attempt by FSB tools that route through the content script (`read_page`, `click`, `type_text`, `get_dom_snapshot`, etc.) fails fast with an attach error. The recovery path is to leave the restricted tab using a tool that does NOT require content-script attachability.

## Safe recovery tools (work even on restricted tabs)

These tools route through the extension's background service worker, not the content script, so they continue to function on `chrome://`, `edge://`, and Web Store URLs.

| Tool       | What it does                                                  | Example                                                                                              |
|------------|---------------------------------------------------------------|------------------------------------------------------------------------------------------------------|
| list_tabs  | Enumerate the agent's owned tabs.                             | `list_tabs({})` -- find a non-restricted tab to switch to.                                           |
| switch_tab | Switch agent focus to another owned tab.                      | `switch_tab({ tab_id: <id from list_tabs> })`                                                        |
| open_tab   | Open a new tab in agent scope (background by default).        | `open_tab({ url: "https://example.com" })`                                                           |
| navigate   | Change the URL of the current tab.                            | `navigate({ url: "https://example.com" })` -- works zero-content-script per Phase 247 active-tab work.|
| go_back    | Step back one history entry on the current tab.               | `go_back({})`                                                                                        |
| go_forward | Step forward one history entry on the current tab.            | `go_forward({})`                                                                                     |
| refresh    | Reload the current tab.                                       | `refresh({})` -- useful after the extension installs mid-session.                                    |

Every tool name in the table above is a registered name in `mcp/ai/tool-definitions.cjs`. Any tool not on this list (`read_page`, `click`, `type_text`, `get_dom_snapshot`, `get_page_snapshot`, `wait_for_element`, etc.) requires content-script attach and will fail on a restricted tab.

## Worked example: bootstrap recovery from chrome://newtab

This is the canonical recovery sequence when the active tab is `chrome://newtab` (the most common bootstrap scenario, since Chrome opens new windows there by default).

1. The first DOM call (e.g., `read_page({})`) fails with an attach error because the active tab is `chrome://newtab`.
2. Call `list_tabs({})` to enumerate owned tabs. This is recovery-safe; it routes through the background service worker, not the content script.
3. If the list contains a normal `http(s)` tab, call `switch_tab({ tab_id })` to focus it. Resume the original work.
4. If no normal tab exists, call `navigate({ url: "https://example.com" })` (or whatever URL the task targets) to leave the restricted page in the current tab. The FSB content script will attach as soon as the destination loads.
5. Re-run the original DOM call. It should now succeed.
6. If the original call still fails, run `node scripts/doctor.mjs`. The failing layer is now `content-script` (the page loaded but the script did not attach), and the doctor's recovery line tells you to reload the tab.

A second common variant is recovering from a Web Store tab (e.g., the user just installed the extension). Same sequence: `list_tabs` -> `switch_tab` to a normal tab, OR `navigate` to a target URL on the current tab.

## When to escalate to the doctor

If recovery fails, run `node scripts/doctor.mjs`. The recovery toolset above handles the active-tab layer. The doctor handles the other five layers (package, bridge, extension, content-script, config). See `USAGE.md` for the full six-layer recovery table.

## See also

- `references/tool-decision-tree.md` -- which tools to reach for first.
- `references/multi-agent-contract.md` -- ownership errors (`TAB_NOT_OWNED`, etc.) that can fire from `switch_tab`.
- `USAGE.md` -- six-layer doctor recovery table.
