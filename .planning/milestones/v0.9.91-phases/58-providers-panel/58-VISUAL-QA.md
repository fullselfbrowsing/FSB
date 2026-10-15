---
phase: 58
slug: providers-panel
source_commit: 1f919d842fd2b793434c4b5432ba397c41cb3d4b
automated_status: passed
visual_status: human_needed
verified: 2026-07-12
---

# Phase 58 Visual QA and Regression Evidence

## Committed source under test

- Commit: `1f919d842fd2b793434c4b5432ba397c41cb3d4b`
- Commit subject: `feat(58-03): render honest agent provider details`
- Branch worktree source was committed before the focused and clean-worktree gates.
- `git diff --check` exited `0` for the Phase 58 source diff.

## Automated regression evidence

### Focused compatibility cluster

Command:

```bash
node tests/providers-panel-logic.test.js &&
node tests/providers-panel-ui.test.js &&
node tests/model-discovery-ui.test.js &&
node tests/model-combobox-ui.test.js &&
node tests/lattice-provider-bridge-smoke.test.js &&
node tests/mcp-client-merged-view.test.js &&
node tests/agent-sunset-control-panel.test.js &&
node tests/universal-provider-lmstudio.test.js
```

Result: exit `0`. The provider logic/UI tests, model discovery/combobox tests, Lattice bridge smoke test, merged MCP-client view, agent-sunset control-panel test, and LM Studio compatibility test all passed.

### Clean-worktree full suite

The suite ran from a detached, initially clean worktree at the exact source commit above:

```bash
git worktree add --detach .context/phase58-clean 1f919d842fd2b793434c4b5432ba397c41cb3d4b
git -C .context/phase58-clean status --porcelain --untracked-files=all
set -o pipefail
npm test 2>&1 | tail -n 40
```

The pre-test status command produced no output. Required ignored dependencies were linked from the main workspace as follows:

- `.context/phase58-clean/node_modules` -> `../../node_modules`
- `.context/phase58-clean/mcp/node_modules` -> `../../../mcp/node_modules`
- `.context/phase58-clean/showcase/angular/node_modules` -> `../../../../showcase/angular/node_modules`
- `.context/phase58-clean/showcase/server/node_modules` -> `../../../../showcase/server/node_modules`

Result: exit `0`. The final output ended with `no-orphan-descriptor: 10 passed, 0 failed`.

An initial environment-only provisioning attempt used dependency links with one extra parent segment and exited `127` at `tsc: command not found`. No product assertion failed. The links were corrected, both `mcp/node_modules/.bin/tsc` and `showcase/angular/node_modules/.bin/ng` were confirmed executable, the worktree was confirmed clean again, and the complete suite then exited `0`. As expected, the suite's build steps regenerated `mcp/build/index.js` and showcase discovery files after the clean precondition had been recorded. The temporary verification worktree was removed afterward.

The shared Conductor worktree also completed `npm test` with exit `0`; its only environment accommodation was a temporary link restoring the user-removed Phase 39 coverage manifest from `.planning/milestones/v1.0.0-phases/`. That link was removed after the run.

## Browser availability

The required in-app Browser workflow was initialized and queried on 2026-07-12. Browser discovery returned an empty backend list (`[]`), so no local page, unpacked extension, screenshot, viewport, OS motion preference, or live Chrome-extension state could be exercised. The browser workflow's troubleshooting guidance was followed before recording the backend as unavailable.

No visual item below is marked passed from source inspection or automated DOM tests. Automated coverage is noted only to help a human reproduce the remaining judgment checks.

## Visual and interaction checklist

| Item | Status | Exact human reproduction |
|------|--------|--------------------------|
| Legacy hash canonicalization | `human_needed` | Load `extension/` unpacked in Chrome, open `ui/control_panel.html#api-config`, and confirm the address changes to `#providers` while the Providers section is active. Open `#providers` directly and confirm the same section renders without a redirect loop. |
| Exactly one advisory badge | `human_needed` | With the local MCP server connected, open Providers and inspect all ten rows. Confirm exactly one `Recommended` badge is visible, it is visually distinct from the orange selected row/radio, and live evidence wins over installed, then clicked, then xAI fallback. |
| Selection survives Refresh | `human_needed` | Select a row that is not recommended without saving, place keyboard focus on its radio, press `Refresh status`, and confirm the checked row, focus, model/key values, and unsaved Save bar do not change while the badge/status updates. Repeat once with the MCP server unavailable. |
| Agent mode removes API controls | `human_needed` | Select Claude Code, OpenCode, and Codex in turn. Tab through the page and confirm model search, model refresh, API keys, LM Studio server, and custom endpoint controls are absent from both view and tab order; confirm agent evidence/account/setup/usage/billing details remain reachable. |
| API mode restores values | `human_needed` | Enter an API provider/model/key value, switch to an agent without saving, then switch back to the API row. Confirm the model/key values and normal model-discovery/key-control tab order are restored exactly. |
| Live, historical, unavailable, and stale states | `human_needed` | Exercise fixtures or real clients for (1) a live agent, (2) durable connected evidence without live, (3) a first-load runtime failure, and (4) a failure after a successful snapshot. Confirm the visible labels are respectively `Connected now`, `Seen before`, `Status unavailable`, and `Status may be stale`; confirm a manual failure announces once as an alert while background failure remains polite status. |
| Empty and unsupported-client states | `human_needed` | With no supported evidence, confirm `No agent CLI detected` and its approved body appear. Add an unsupported/raw MCP identity and confirm collapsed `Other MCP clients (N)` text appears without a radio, recommendation, setup CTA, or interpreted markup. |
| Agent usage and billing details | `human_needed` | Select each agent and confirm Account is `Not reported`, Tokens/Turns/Duration are three em dashes, `No delegated runs yet` is visible, no cost/currency field appears, vendor-specific copy is readable, and the billing link opens the documented official HTTPS destination in a new tab. Confirm `Open setup guide` opens the existing onboarding page. |
| Light and dark themes | `human_needed` | In both light and dark modes, confirm card/row/badge/error contrast, readable helper/billing text, orange selection versus informational recommendation, and visible focus rings. Check that no state depends on color alone. |
| Desktop and compact layout | `human_needed` | At a desktop width >=900px, confirm Agent CLIs and API providers form two columns. At 641-899px confirm one-column groups. At <=640px confirm stacked facts/usage, full-width actions, wrapped long/raw names and badges, >=44px controls, and no horizontal scrolling. |
| Keyboard and focus retention | `human_needed` | Use only Tab, arrow keys, and Space to traverse/select the single native radio group. Confirm browser-native movement, visible focus, one checked radio, no nested row actions, and no focus jump after automatic or manual evidence refresh. |
| Reduced motion | `human_needed` | Enable the OS/browser reduced-motion preference, reload Providers, and trigger Refresh. Confirm status text and live-region announcements update while the refresh icon does not spin and no provider row/button transform, shimmer, or transition remains. |

## Handoff

Automated functional acceptance is green at the committed Phase 58 source HEAD. Live visual judgment remains explicitly `human_needed` because the in-app Browser had no available backend in this session.
