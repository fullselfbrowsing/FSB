# Full Self Browsing for Claude

![Full Self Browsing logo](assets/logo.png)

Full Self Browsing (FSB) lets Claude read and operate websites in your own Chrome, Edge or Brave browser, with the sessions you are already signed in to. Claude can open tabs, read pages, fill forms, click, scroll, take screenshots and use site capabilities, while you watch every action in the browser.

This plugin contains one skill (`fsb`) and one local MCP server configuration. The FSB browser extension does the browser work; the plugin starts the FSB MCP server on your computer, and the extension connects to it over a local loopback connection. Neither the extension nor the server is bundled here: install the extension from the Chrome Web Store, and the server is downloaded from npm the first time Claude starts it.

## Where it works

- **Claude Code** in a terminal or IDE on your computer.
- **Cowork tasks that run on your computer** in the Claude desktop app. Claude starts the FSB server on your computer, outside Cowork's VM, so it can reach the extension at `127.0.0.1:7225`. If your organization turns on `requireCoworkFullVmSandbox`, the server may start inside the VM, where it cannot reach your browser or may not be able to download the package; use Claude Code in a terminal instead.
- **Not supported:** regular Claude chat (it ignores local MCP servers), Claude Code on the web, and Cowork tasks that run in the cloud. Those have no access to the browser on your computer.

## Requirements

1. A desktop Chromium browser, version 116 or newer: Chrome, Edge, Brave or Chromium.
2. The [FSB extension from the Chrome Web Store](https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk), enabled, with at least one normal browser window open on an `http` or `https` page.
3. Node.js 18.20 or newer, installed system-wide so `npx` is on the PATH that the Claude apps use. Check with `node --version` and `npx --version` in a terminal.

No FSB account, API key or pairing step is needed for the browser tools. FSB autopilot (`run_task`) is optional and needs an AI provider key configured in the extension.

## Install

In Claude Code:

```bash
claude plugin marketplace add fullselfbrowsing/fsb-claude-plugin
claude plugin install full-self-browsing@full-self-browsing
```

Or run `/plugin marketplace add fullselfbrowsing/fsb-claude-plugin` inside a Claude Code session and install **full-self-browsing** from the `/plugin` menu. Once the plugin is listed in the Claude directory, you can also add it from **Customize > Plugins** in the Claude desktop app, which makes it available in Cowork and Claude Code.

Restart Claude Code after installing. Run `/mcp`: the server `plugin:full-self-browsing:fsb` should show as connected. The first start downloads the server package from npm, which can take a few seconds.

**Use one FSB server.** If you installed FSB into Claude Code before (for example with the FSB onboarding page or `install --claude-code`), remove that entry with `claude mcp remove fsb`, so Claude does not see two copies of every FSB tool. When you set up the extension, skip its "install into Claude Code" step.

## Try it

Keep one normal browser window open and visible, then ask Claude:

- "Use FSB to open https://en.wikipedia.org/wiki/Model_Context_Protocol in a new tab and summarize the lead section."
- "Use FSB on https://httpbin.org/forms/post: fill in the customer name Test Reviewer, choose the Medium size and the Bacon topping, and do not submit the form."
- "Use FSB to take a screenshot of that tab and list the form fields you see."

Claude asks before anything that sends, posts, buys or deletes, hands passwords, one-time codes and CAPTCHAs to you, and closes the tabs it opened when it is done.

## Troubleshooting

Run the diagnostics in a terminal on the same computer (not from a Cowork task, whose commands run in its VM):

```bash
npx -y fsb-mcp-server@0.11.5 doctor
```

| Problem | What to do |
| --- | --- |
| No FSB tools in Claude | Check `/mcp`. Make sure `node` and `npx` are installed system-wide, then restart Claude. |
| Tools report that the extension is not connected | Open the browser with the FSB extension enabled and a normal web page, then retry. |
| `doctor` reports `ORIGIN_PIN_MISMATCH` | The bridge is paired with a different extension install. Run `npx -y fsb-mcp-server@0.11.5 pair --reset` and retry. |
| Page reads fail | Switch to a normal `http` or `https` page. `chrome://` pages and the Web Store cannot be automated. |
| Actions on a background tab do nothing | Keep the target window visible; some browsers drop input to hidden tabs. |
| Two copies of each FSB tool | Remove the manual entry with `claude mcp remove fsb`. |

Only one browser profile attaches to FSB at a time, and the server needs local port `7225` to be free or held by another FSB server.

## What this plugin runs, sends and fetches

**What Claude starts:** `npx -y fsb-mcp-server@0.11.5`. `npx` downloads that exact package version and its bundled dependencies from the npm registry (`registry.npmjs.org`) on first use. The package source is in the [FSB repository](https://github.com/fullselfbrowsing/FSB) under `mcp/`.

**What the server does on your computer:**

- Listens for the extension only on the loopback address `127.0.0.1:7225`. When another FSB server already holds that port, it connects to that one over loopback instead and relays through it.
- At startup, runs `claude --version`, `codex --version` and `opencode --version`, and checks whether the configuration paths of about 20 MCP clients exist. It sends that detected or not-detected list to the extension, which uses it to show which clients are set up. It does not read the contents of those files.
- Writes only under `~/.fsb`: the loopback pairing secret (`bridge-auth.json`), screenshots you ask for (`screenshots/`, deleted after 7 days while a server is running), and diagnostic logs (`agent-runtime/`, rotated at 1 MiB).
- Makes no outbound internet requests and sends no telemetry. It reads no credentials from environment variables.

**What the FSB extension sends** (the extension is installed separately and has its own [privacy policy](https://full-selfbrowsing.com/privacy)):

| Destination | Purpose |
| --- | --- |
| The websites and site APIs you ask Claude to use | Browser actions in your signed-in profile |
| `https://full-selfbrowsing.com/api/telemetry/events` | Anonymous usage telemetry, on by default; turn off **Send anonymous usage data** in the extension's Advanced Settings |
| `https://full-selfbrowsing.com/api/auth/register` and `wss://full-selfbrowsing.com/ws` | Extension 0.9.95 and earlier register with the FSB dashboard service and keep a relay connection that also carries usage totals (cost, token and request counts) |
| The AI provider you configure (for example `api.anthropic.com`, `api.openai.com`, `api.x.ai`, `generativelanguage.googleapis.com`, `openrouter.ai`, or a local LM Studio endpoint) | Only for FSB autopilot (`run_task`) and other optional AI features: the task text and page summaries go to that provider |
| `2captcha.com` | Only for FSB autopilot, and only if you save a 2Captcha API key in the extension |

Page content and screenshots that Claude requests are returned to Claude and may be processed by Claude's model. Saved passwords, full card numbers and security codes are filled inside the extension and are never returned to Claude.

## Support and security

- Questions and bugs: [GitHub issues](https://github.com/fullselfbrowsing/FSB/issues) and the [FSB support page](https://full-selfbrowsing.com/support).
- Security reports: see [SECURITY.md](SECURITY.md).
- Privacy: [FSB Privacy Policy](https://full-selfbrowsing.com/privacy).

## License

[MIT](LICENSE).
