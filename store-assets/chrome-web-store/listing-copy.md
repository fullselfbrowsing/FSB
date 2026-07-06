# Chrome Web Store Listing Copy

## Title

FSB v0.9.90

## Summary

FSB - Universal AI-powered browser automation assistant with multi-model support

## Description

FSB is a Chrome extension for AI-assisted browser automation. Give it a natural-language task, connect your preferred model provider, and use it to inspect pages, plan actions, click, type, navigate, and summarize what happened from the popup or side panel.

FSB is built for developers, QA testers, researchers, and power users who want a transparent browser assistant they can configure, observe, and control.

What FSB does:

- Runs browser tasks from natural-language instructions.
- Supports multiple model providers, including xAI, OpenAI, Anthropic, Gemini, OpenRouter, LM Studio, and custom OpenAI-compatible endpoints.
- Provides popup and side-panel workflows for running and monitoring tasks.
- Shows visible page progress with overlays, action feedback, and session status.
- Includes developer-oriented diagnostics, action history, token/cost tracking, and analytics views.
- Offers site memory and page-intelligence tools for understanding complex web pages.
- Connects to the optional `fsb-mcp-server` bridge so MCP clients such as Claude Code, Codex, Cursor, VS Code, and other compatible tools can drive the same browser extension.

Why install it:

- Automate repetitive browser workflows without writing one-off scripts.
- Test and inspect real websites with a supervised browser assistant.
- Compare hosted, routed, local, and custom model providers from one extension.
- Keep control in the browser with visible progress, settings, diagnostics, and stop controls.
- Use the extension locally without needing a hosted FSB account.

Setup notes:

- AI-powered automation requires your own provider API key or a reachable local model endpoint such as LM Studio.
- The extension stores configuration in Chrome storage.
- API keys and saved sensitive values are handled through the extension's secure configuration and vault flows.
- FSB asks for broad browser permissions because it needs to read and act on the pages you choose to automate.
- Model requests are sent to the provider you configure.

FSB is best used as a supervised assistant. Review tasks before running them, avoid using automation on sensitive pages unless you understand the workflow, and stop a session any time the browser is not doing what you expect.

## Category

Developer Tools

## Language

English

## Official URL

None, unless Google Search Console ownership is already registered for `full-selfbrowsing.com`.

## Homepage URL

https://full-selfbrowsing.com

## Support URL

https://full-selfbrowsing.com/support

## Global Promo Video

Leave blank unless you have a YouTube demo video ready.

## Asset Upload Map

- Store icon: `store-icon-128.png`
- Screenshots:
  - `screenshots/01-demo-task-input.png`
  - `screenshots/02-demo-task-result.png`
  - `screenshots/03-api-configuration.png`
  - `screenshots/04-dashboard-analytics.png`
  - `screenshots/05-intelligence-graph.png`
- Small promo tile: `small-promo-tile-440x280.png`
- Marquee promo tile: `marquee-promo-tile-1400x560.png`

## Data Collection

FSB v0.9.69 collects opt-out anonymous usage telemetry so the project can publish aggregate adoption metrics (total installs, active sessions, token throughput) at https://full-selfbrowsing.com/stats. Telemetry never touches the pages you browse and can be disabled in one click from the Control Panel.

What FSB collects:

- A random per-install UUID stored locally as `fsbInstallUuid` in `chrome.storage.local` (generated client-side, never tied to user identity).
- The name of the MCP client used (Claude Code, Cursor, Codex, …) — drawn from a fixed allowlist.
- The name of the model used (grok-4-fast, claude-opus-4, …) — drawn from a fixed allowlist.
- Aggregate input/output token counts per session.
- A count of active FSB agents on the install (an integer).

What FSB does NOT collect:

- Page URLs, hostnames, or browsing history.
- Prompts, instructions, task descriptions, or any natural-language text sent to the model provider.
- Page DOM, screenshots, page content, or AI responses.
- Plaintext IP addresses (the server hashes the request IP with a daily-rotating salt for rate limiting and discards it).
- Names, usernames, account handles, or any free-form identity fields.
- Email addresses, phone numbers, or contact information.

Retention:

- Raw events: 7 days.
- Daily rollups (one row per install per day): 365 days.
- Global aggregates (one row per day, no per-install dimension): indefinite, so historical charts on `/stats` remain stable.

Opt-out path:

- Open the FSB Control Panel, scroll to Advanced Settings, and toggle off "Send anonymous usage data". The change takes effect immediately.

Limited Use affirmation:

FSB's anonymous usage telemetry is used only to compute aggregate usage statistics displayed publicly at full-selfbrowsing.com/stats. The data is never sold, never shared with third parties, never used for advertising, and never used to train any machine-learning models. This commitment satisfies the Chrome Web Store's Limited Use requirement.

Full privacy policy:

- https://full-selfbrowsing.com/privacy#telemetry-disclosure
