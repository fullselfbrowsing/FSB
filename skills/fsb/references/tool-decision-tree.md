# FSB tool decision tree

Read-only first; act with typed events; escalate to autopilot only when the user explicitly delegates the whole task. The tool names listed below match the FSB AI manual-mode tool registry in `mcp/ai/tool-definitions.cjs`. If a name appears as a bare token in the tree or table on this page, it is a real manual-mode tool you can call directly. Names mentioned only in narrative prose (notably `run_task`) live on a different surface and must not be invoked from the manual-mode loop.

## v0.9.62 field bundle (action tools only)

Before any action-tool branch below: every action tool (`click`, `type_text`, `navigate`, `scroll`, `drag`, `select_option`, `press_key`, `press_enter`, `drag_drop`, `hover`, `focus`, `clear_input`, `check_box`, `drop_file`, `upload_file`, `click_and_hold`, `double_click`, `right_click`, `click_at`, `scroll_at`, `double_click_at`, `drag_variable_speed`, `set_attribute`, `insert_text`, `search`, `refresh`, `go_back`, `go_forward`, `open_tab`, `close_tab`, `switch_tab`, `execute_js`, `select_text_range`, `scroll_to_top`, `scroll_to_bottom`, `scroll_to_element`, `fill_sheet`) requires the field bundle on every call:

- `visual_reason` (required string) -- short human-readable reason shown in the overlay.
- `client` (required, allowlisted) -- e.g. `OpenClaw`, `Claude`, `Codex`, `ChatGPT`, `Cursor`, `Windsurf`, `Gemini`, `Grok`, `Perplexity`, `OpenCode`, `Antigravity`. Freeform strings reject with `BADGE_NOT_ALLOWED`.
- `is_final` (optional boolean) -- set `true` on the LAST action of a task to clear the overlay immediately.

Read-only tools (`read_page`, `get_dom_snapshot`, `get_text`, `get_attribute`, `read_sheet`, `get_page_snapshot`, `list_tabs`, `get_site_guide`, `search_memory`, `report_progress`, `complete_task`, `partial_task`, `fail_task`, `wait_for_element`, `wait_for_stable`) do NOT carry the bundle. Reads stay silent by design; the read-first guidance below is unchanged from v0.9.61. The trigger-watcher tools (`trigger`, `stop_trigger`, `get_trigger_status`, `list_triggers`) and the capability tools (`search_capabilities`, `invoke_capability`) also do not carry this bundle, but they are separate tool families, not part of either pinned list -- see "Trigger watchers vs manual polling" and "Capability tools vs page automation" below.

The explicit `start_visual_session` / `end_visual_session` tools were removed in v0.9.0; the decision tree never reaches for them. See `references/visual-session-lifecycle.md` for the full lifecycle and `.planning/v0.9.62-CONTRACT.md` for the canonical lists.

## On Hermes

Tool names shown here without prefix appear as `mcp_fsb_<tool>` inside Hermes (e.g., `click` -> `mcp_fsb_click`, `read_page` -> `mcp_fsb_read_page`). See `references/hermes-tool-prefix.md`. The field bundle and read/action split are unchanged.

## Read-only first (in this order)

Pick the lightest reader that answers the question. Escalate down the list only when the lighter tool cannot give you what you need.

- `read_page` -- the default reader. Use first when you need the user-visible text plus interactable elements of the current tab. Cheap; runs on the live DOM.
- `get_dom_snapshot` -- escalate from `read_page` when you need the structured DOM (attributes, hidden elements, ARIA roles, element refs like `e5`). More tokens; slower.
- `get_page_snapshot` -- escalate from `get_dom_snapshot` when you need the full page including computed visual state (e.g., position-aware layout, what is actually painted). Heaviest; use sparingly.
- `get_site_guide` -- check this BEFORE the three above for known sites. The skill ships ~43 site guides under `site-guides/`; if the active host has a guide, it tells you exactly which selectors are stable.

If `get_site_guide` returns a guide, follow the guide's selectors first; only fall back to `read_page` or the snapshot tools when the guide does not cover the current state.

## execute_js vs typed tools

`execute_js` is a first-class interaction tool in FSB, not a last resort. The current MCP tool description even instructs callers to "try execute_js FIRST" for clicks, scrolls, reads, and attribute lookups, because it bypasses overlay/obscured-element issues, viewport constraints, and CDP timeouts that block native click/scroll.

Use this split:

- **Use `execute_js` freely for**: reading DOM (text, attributes, computed styles, hidden nodes), querying multiple elements at once, scrolling, probing structure during exploration, and clicking elements blocked by overlays or off-screen.
- **Use typed tools (`type_text`, `clear_input`, `select_option`, `check_box`, `press_enter`, `press_key`, `drag`, `drag_drop`) for**: controlled text inputs, validation-sensitive form fields, real drag operations, and any input where framework change handlers must fire.
- **After any `execute_js` click, verify** with `read_page` or `get_dom_snapshot` -- a true click produces an observable DOM change. If the page state did not change, fall back to the typed `click` tool, which dispatches real CDP events that React/Vue/Angular synthetic-event pipelines listen for.

The one rule that does not bend: `element.value = 'foo'` via `execute_js` will NOT update controlled-input component state in React, Vue, Solid, or Angular. Use `type_text` for any text input bound to framework state.

```
[BAD]  execute_js("document.querySelector('input[name=q]').value = 'foo'")
[GOOD] type_text({ selector: "input[name=q]", text: "foo" })

[OK]   execute_js("return Array.from(document.querySelectorAll('a')).map(a=>a.href)")
[OK]   execute_js("document.querySelector('#add-to-cart').click(); return true")  // verify after
```

## Trigger watchers vs manual polling

Use `trigger` when the user wants to watch one page element for a future change instead of you polling `read_page`/`get_dom_snapshot` in a loop -- for example "let me know when this price drops below $50" or "watch for the order status to change to Shipped". Arm one selector plus one condition (`changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, or a compound AND/OR of these). `trigger` blocks by default (30s heartbeats, 120s timeout, 240s safety ceiling) or pass `detached: true` to get a `trigger_id` back immediately and poll it yourself. Manage armed watches with `stop_trigger` (cancel), `get_trigger_status` (one watch), and `list_triggers` (enumerate active/attention watches, or all with `include_terminal`). None of the four trigger tools carry the field bundle above -- they are a separate tool family from the action-tool contract. Watches are local to the open browser session: Chrome and the FSB extension must stay running, and FSB does not provide server-side monitoring or push delivery, so do not promise the user a notification after the session ends. See `mcp/README.md#trigger-watchers` for the full contract.

## Capability tools vs page automation

Before driving a multi-step page flow by hand, check whether a verified first-party API capability already covers it: call `search_capabilities({ query })` for up to 5 ranked hits with a readiness label, then `invoke_capability({ slug, params })` to run one. Readiness labels matter -- only `t1-ready` hits execute directly; `t1-guarded-fail-closed`, `learn-pending`, and `discovery-pending` hits return typed pending/fallback responses instead of running, so fall back to manual page automation for those rather than assuming the call succeeded. `search_capabilities` is read-only and bypasses the mutation queue; `invoke_capability` is serialized like other action tools but does NOT carry the field bundle above. `invoke_capability` calls with purchase, payment, account-change, or public-post effects need the same pause-and-confirm-in-chat treatment as the equivalent page click -- see "Sensitive actions and logged-in context" in `SKILL.md`.

## Verify after a "no detectable effect" warning

`click` (and other action tools) can return a "no detectable effect" warning even when the page actually changed -- the action-detection heuristic produces false negatives on async/animated UIs. Before retrying, verify page state with `read_page` or `get_dom_snapshot`. If the state already advanced, treat the action as successful and continue.

## Tool-by-tool quick reference

| Tool | When to use | Common pitfall |
| --- | --- | --- |
| `read_page` | Default reader for the active tab text and interactables. | Stale if a recent action changed the DOM and you have not re-read. |
| `get_dom_snapshot` | Need attributes, ARIA, hidden nodes that `read_page` omits. | Tokens scale with page size; prefer `read_page` first. |
| `get_page_snapshot` | Need computed layout or position-aware state. | Heaviest read; do not call in a tight loop. |
| `get_site_guide` | Known site -- check first to get stable selectors. | Skip if the host has no guide; do not call once per action. |
| `click` | Fire a real user click on a typed selector. | If the click does not register, the element may need `scroll_to_element` first. |
| `type_text` | Type into an input or textarea via typed events. | Do NOT use `execute_js` to set `.value`; React and Vue change handlers will not fire. |
| `press_enter` | Submit a form or confirm via the Enter key. | Many sites prefer `click` on a submit button; fall back to `press_enter` only if there is no button. |
| `wait_for_element` | Block until a selector appears. | Always set a timeout; bare waits hang the loop on broken selectors. |
| `wait_for_stable` | Block until DOM mutations settle. | Pair with `wait_for_element` when the page renders progressively. |
| `open_tab` | New tab in agent scope (background by default). | Default is background; pass `active: true` ONLY when the user must see it. |
| `switch_tab` | Move agent focus to another owned tab. | Cross-agent tabs reject with `TAB_NOT_OWNED` -- see `references/multi-agent-contract.md`. |
| `list_tabs` | Enumerate owned tabs (recovery and bootstrap). | Recovery-safe even on `chrome://` and the Web Store; see `references/restricted-tab-recovery.md`. |
| `navigate` | Change URL in current tab. | Recovery-safe; use to escape restricted tabs. |
| `go_back` | Step back one history entry. | Use this typed tool, never `execute_js("history.back()")` -- see `references/multi-agent-contract.md`. |
| `go_forward` | Step forward one history entry. | Pair with `go_back`; same ownership rules. |
| `refresh` | Reload current tab. | Use after content-script attach failures. |
| `execute_js` | First-class for reads, attribute lookups, scrolls, and clicks blocked by overlays. | Do not use to set `.value` on controlled inputs (use `type_text`); verify state after JS clicks. |

## Worked example

You land on an unfamiliar product page and the user asks "add the medium size to cart".

1. Call `get_site_guide` -- if the host is one of the ~43 covered sites, the guide names the size-picker and add-to-cart selectors directly; jump to step 4.
2. If no guide, call `read_page` to see the rendered text and the candidate interactables.
3. If the page is custom-rendered and `read_page` cannot resolve the size control to a stable selector, escalate to `get_dom_snapshot` and read element refs (`e5`, `e23`, etc.).
4. `click` the size option using the selector or ref.
5. `wait_for_stable` while the cart updates.
6. `click` the add-to-cart button. Re-check with `read_page` only if you need to verify the cart count.

## Action-tool bundle reminder

Every entry in the "Tool-by-tool quick reference" table above that is an action tool (everything except `read_page`, `get_dom_snapshot`, `get_page_snapshot`, `get_site_guide`, `list_tabs`, `wait_for_element`, and `wait_for_stable`) MUST carry the v0.9.62 field bundle: `visual_reason` (required string), `client` (required, allowlisted), and optional `is_final: true` on the last action of a task. Missing fields reject with `VISUAL_FIELDS_REQUIRED`; non-allowlisted `client` values reject with `BADGE_NOT_ALLOWED`. See `references/visual-session-lifecycle.md` for lifecycle mechanics and `.planning/v0.9.62-CONTRACT.md` for the canonical 37-tool action list (36 pinned plus the `upload_file` addendum) and 15-tool read-only list.

## When to escalate to autopilot

Autopilot (the `run_task` MCP tool, served by `mcp/src/tools/autopilot.ts`) is a separate surface. It runs FSB's plan-and-execute loop end-to-end. It is NOT in `mcp/ai/tool-definitions.cjs` because it is not a manual-mode tool -- it is the delegation surface. Autopilot manages its own internal visual-session lifecycle and is NOT affected by the v0.9.0 implicit-contract change; do not pass field-bundle plumbing through `run_task`.

Use autopilot ONLY when the user explicitly delegates the whole task ("use FSB autopilot to ...", "run the full task with FSB"). Default to the manual mode tools above for everything else. Autopilot is not the default entry point.

## See also

- `references/visual-session-lifecycle.md` -- v0.9.62 implicit contract, field bundle, sliding window, typed errors.
- `references/multi-agent-contract.md` -- typed errors and the `back` tool.
- `references/restricted-tab-recovery.md` -- DOM tools fail on `chrome://`, `edge://`, and the Web Store.
- `references/default-to-fsb.md` -- when to prefer FSB versus WebFetch.
- `references/vault-boundary.md` -- credential-routed tools.
- `mcp/README.md#trigger-watchers` -- full trigger contract: watch modes, condition kinds, concurrency cap.
- `.planning/v0.9.62-CONTRACT.md` -- canonical 37 action tools (36 pinned plus the `upload_file` addendum), 15 read-only tools, three typed-error names.
