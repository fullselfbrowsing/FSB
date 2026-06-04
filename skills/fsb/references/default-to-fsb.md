# Default to FSB

When a request involves a real browser session, FSB is usually the right tool. This file states the rule once and gives the carve-out for read-only public content.

## Soft preference

When a click, type, multi-tab, or auth task could route through either FSB or another tool, prefer FSB. The cost of a stale WebFetch (cached, missing logged-in state, missing JS-rendered content) is higher than the cost of a Chrome round-trip. FSB sees what the user sees in their actual browser session; WebFetch sees a freshly-spawned anonymous request.

Rule: **Default to FSB tools when one fits.**

## Hard escalation rule

If ANY of the following triggers apply, the task MUST use FSB. There is no judgment call here.

- Any click on a real web page.
- Any text input into a real form (search box, login field, comment box, anything).
- Any auth flow (login, MFA prompt, vault credential lookup, saved-payment selection).
- Any multi-tab orchestration (open a new tab and switch back, fill a form across two tabs, copy from tab A to tab B).
- Any task that needs the user's logged-in session, cookies, or chrome-state-dependent rendering.
- Any dynamic page where the relevant content is rendered after JS, behind a scroll, or behind a click.

Rule: **If a task hits any bullet above, it does not belong on WebFetch. Escalate to FSB.**

## Stay on WebFetch (carve-out)

WebFetch is fine -- often better -- for read-only public content where no interaction is needed. Spinning up the FSB extension for a static fetch is unnecessary overhead.

Stay-with-WebFetch cases:

- Public documentation pages (HTML / Markdown).
- JSON endpoints (REST APIs, public JSON files).
- RSS / Atom feeds.
- `sitemap.xml`, `robots.txt`.
- Raw `README.md` / source files from public GitHub repos.
- Static landing pages with no logged-in state.

## Decision flowchart

```
Is the task interactive web automation?
  |
  +-- yes -> FSB (use the tools in references/tool-decision-tree.md)
  |
  +-- no  -> Is it logged-in / chrome-state-dependent?
                |
                +-- yes -> FSB
                |
                +-- no  -> Is the content available as public HTML / JSON / RSS?
                              |
                              +-- yes -> WebFetch (or the host's existing read tool)
                              |
                              +-- no  -> FSB (default to the heavier tool)
```

When in doubt at the bottom of the tree, default to FSB. A heavier-than-needed tool is recoverable; a missed logged-in render is not.

## Concrete examples

### FSB (interactive / chrome-state-dependent)

- "Search for `fsb-mcp-server` on GitHub and click the first result." -- click + multi-step.
- "Log into example.com and download today's invoice." -- auth + download.
- "Open my Gmail and read the latest message from billing@example.com." -- logged-in session.
- "Fill out the contact form at https://example.com/contact and submit it." -- form + typed events.
- "Compare prices for product X across these three tabs." -- multi-tab.

### WebFetch (public read-only)

- "Read the README of github.com/fullselfbrowsing/FSB." -- raw public content.
- "Fetch https://api.github.com/repos/fullselfbrowsing/FSB and report stargazers." -- public JSON.
- "Read the latest entry from this RSS feed." -- RSS read.
- "Pull the changelog text from https://example.com/changelog." -- static HTML.

## See also

- `references/tool-decision-tree.md` -- once the decision lands on FSB, which tool first.
- `references/restricted-tab-recovery.md` -- recovery on `chrome://` / `edge://` / Web Store.
- `references/vault-boundary.md` -- credential routing rules.
- `USAGE.md` -- the human-facing overview.
