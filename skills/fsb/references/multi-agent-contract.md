# FSB multi-agent contract (current as of v0.9.91)

This file documents the rules that make FSB's per-agent tab ownership work. Anyone calling FSB tools through MCP MUST follow these rules; breaking them produces typed errors that recover cleanly only when the caller knows the contract. The contract is small (six error names + the `agent_id` rule + the `back` tool), but every rule matters: bypassing one corrupts the ownership graph and the only recovery is closing the affected tab.

## Tab ownership behavior (v0.8.0+)

- Each agent owns its own tabs. `open_tab` defaults to `active: false` so it claims a tab without stealing the user's focus -- only pass `active: true` when the user explicitly needs to see that tab.
- Do not foreground a tab unless the task requires it. `switch_tab` defaults to background; it foregrounds only when `active: true` is explicit.
- Close only tabs this agent owns. `close_tab` refuses the active foreground tab unless `allow_active: true` is set. Never close or reopen Chrome itself.
- There is no global browser lock. The per-agent ownership graph is the only concurrency mechanism -- do not introduce a global lock as a blocker.

## Never pass agent_id

Callers MUST NOT pass `agent_id` on any FSB MCP tool call. The FSB MCP server mints `agent_id` when a session opens and threads it through the bridge automatically.

Caller-supplied `agent_id` breaks ownership accounting -- a fabricated id either steals tabs from another agent or claims tabs the bridge has not handed out. The server's session map is the only authority on which agent owns which tab; do not try to anticipate, derive, or override it from the calling side.

```
[BAD]  click({ selector: "#submit", agent_id: "openclaw-1" })
[GOOD] click({ selector: "#submit" })
```

## Six typed errors and how to recover

When an FSB tool call hits one of the dispatcher boundaries, the server returns a structured error with one of the names below. Match on the name; do not parse the human-readable message.

### NO_OWNED_TAB

- What it means: The calling agent does not currently own any tabs. The most common cause is the very first tool call of a fresh agent session (including `start_visual_session`).
- What to do: Call `open_tab({ url, active: false })` to claim a tab without stealing focus, then retry the original call. `navigate` and `switch_tab` can also claim an unowned normal tab if one already exists.

### AMBIGUOUS_TAB

- What it means: The calling agent owns multiple tabs and the tool did not specify a `tab_id`, so the target is ambiguous.
- What to do: Call `list_tabs` to enumerate owned tabs, then retry with the intended `tab_id`.

### TAB_NOT_OWNED

- What it means: The tool targeted a tab that belongs to a different agent (or to `legacy:sidepanel`).
- What to do: Either call `switch_tab` to a tab this agent owns, or `open_tab` to create a new one in agent scope.

### AGENT_CAP_REACHED

- What it means: The session hit its concurrent-agent cap (default 8, configurable 1-64 in extension settings).
- What to do: Reduce parallel calls, finish in-flight tasks, or raise the cap from the FSB extension's options page.

### TAB_INCOGNITO_NOT_SUPPORTED

- What it means: The targeted tab is in an Incognito window. FSB rejects Incognito tabs at the dispatcher boundary because the extension's storage and ownership model do not span Incognito.
- What to do: Move the work to a normal (non-Incognito) Chrome window. Open a new tab there with `open_tab`.

### TAB_OUT_OF_SCOPE

- What it means: The targeted tab is in a different Chrome window than the agent's session window. Each agent only sees tabs in the window where its session began.
- What to do: Use `list_tabs` to enumerate this agent's owned tabs and pick one; if the work belongs in a different window, open a new tab in the current window with `open_tab`.

## Use back instead of execute_js('history.back()')

Use the typed `back` tool (FSB v0.8.0+) for one-step history navigation. Do NOT call `execute_js("history.back()")`.

`back` is typed, ownership-gated, BF-cache aware, and history-depth-tracking. It returns a structured result with status fields the caller can branch on. `execute_js("history.back()")` is none of those: it bypasses ownership, lies about success on BF-cached pages, and returns whatever the JS evaluator coerced last.

```
[BAD]  execute_js("history.back()")
[GOOD] back({})
```

Note: `go_back` (`mcp/ai/tool-definitions.cjs`, part of the 37-tool action-tool field-bundle contract) and `back` (`mcp/src/tools/agents.ts`, outside that contract) are two distinct tools that coexist in the current build, not version alternates for the same surface. `go_back` carries the `visual_reason`/`client` field bundle like other action tools; `back` does not, but adds a richer `change_report` (URL, dialogs, node/attribute/input changes, focus shift) plus explicit `status` values (`ok`, `no_history`, `cross_origin`, `bf_cache`, `fragment_only`). Prefer `back` for its structured result. Both are typed, ownership-gated, and BF-cache aware; never fall back to `execute_js`.

## Why the contract matters

FSB's per-agent ownership is what lets multiple AI sessions share one Chrome instance without fighting. The contract is small (six error names plus `agent_id` plus `back`), but every rule matters -- bypassing one rule corrupts the ownership graph and the only recovery is closing the affected tab.

## Default recovery ladder

When a tool call fails and you are not sure which layer broke, try these in order before escalating to the doctor:

1. `list_tabs({})` -- check whether this agent owns any tab. Recovery-safe; works on restricted URLs too.
2. If no owned tab: `open_tab({ url, active: false })` to claim one in the background.
3. If the tab is on a non-injectable URL (`chrome://`, `edge://`, Web Store, `data:`, `file:`): `navigate({ url })` to a normal `http(s)` page.
4. If the page loaded but DOM tools still fail: bridge or content-script issue. Run `node scripts/doctor.mjs`.

## See also

- `references/tool-decision-tree.md` -- which tools to reach for first.
- `references/restricted-tab-recovery.md` -- recovery on `chrome://`, `edge://`, and Web Store tabs.
- `references/default-to-fsb.md` -- soft preference and hard escalation rule.
- `references/vault-boundary.md` -- credential routing rules.
