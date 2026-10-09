# Full Self Browsing for Grok Bot

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/fsb_logo_dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="assets/fsb_logo_light.png" />
    <img src="assets/fsb_logo_light.png" alt="FSB Full Self Browsing" width="200" />
  </picture>
</p>

Connect Grok Bot to its Chrome browser through [Full Self Browsing](https://www.full-selfbrowsing.com) (FSB). Read live page content, interact with websites, use application capabilities and keep each agent's work in its own tabs.

This package contains one `fsb` skill and one stdio MCP configuration. Install the Chrome extension from the Web Store; the MCP server is fetched from npm when the host launches it. Neither runtime is bundled here. Plugin version `0.1.0` is independent of the MCP and extension versions. HCS is a separate integration.

Product demo: [v0.9.91 | Full Self-Browsing](https://www.youtube.com/watch?v=osNHSquClo0).

## Setup on Bot's computer

FSB's Chrome extension and MCP process must run **together on Grok Bot's own computer**. Their bridge uses loopback WebSocket port `7225` on that computer. Installing the extension on your separate Mac does not attach it to Bot's computer.

1. On Bot's computer, install Node.js **18.20.0 or newer** from [Node.js](https://nodejs.org/en/download). Confirm both `node` and `npx` are on the PATH used by Bot's MCP process.
2. Open Chrome on that computer and install the [FSB Chrome extension](https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk). Keep Chrome running with FSB enabled and a normal HTTP or HTTPS page open. Reload pages that were open before extension installation.
3. Once this package is listed, open Bot's **Plugins → Marketplace**, search for **Full Self Browsing**, and install it. Team policies may restrict availability. The package does not install Node, Chrome or the extension automatically.
4. Ask Bot to use FSB for a small browser read. If the extension shows a bridge pairing request, complete its local pairing flow. Confirm the connection targets the browser on Bot's computer before continuing.

The configured server is named `fsb` and launches as `npx -y fsb-mcp-server@0.11.0`. Its first launch may download the package and dependencies. Keep one intended FSB server configuration active; an existing manual FSB connection may otherwise duplicate or override the plugin connection.

Manual MCP browsing requires no FSB API key or separate provider OAuth. Websites use the sessions in Bot's browser profile, so sign in there when needed. Optional FSB autopilot requires a configured model provider and can incur provider charges.

FSB already works on the owner's Bot computer. Public marketplace availability and the installation of this new wrapper remain subject to publisher review. [Bot's plugin documentation](https://cursor.com/help/grok-bot/connect-plugins) describes account and team controls.

## Using FSB

Example requests:

- "Use FSB on your computer to open example.com, summarize the page and close your test tab."
- "Use FSB to read this signed in dashboard and draft a summary."
- "Use FSB to check this form and report what needs fixing."

The skill guides Bot to discover FSB through its supported tool interface and use the actual returned identifiers. Tool prefixes and the historical `user-fsb` alias are not fixed package contracts. Action calls use `client: "Grok"` and a short `visual_reason`. Manual tools are the default; use `run_task` only for explicit FSB autopilot delegation.

Read bounded results, verify each action and clean up task-owned tabs without closing the user's foreground tab. Bot's existing review, tool controls and team policies still apply.

## Troubleshooting

Run diagnostics **on Bot's computer**:

```bash
node --version
npx --version
npx -y fsb-mcp-server@0.11.0 doctor
npx -y fsb-mcp-server@0.11.0 status
```

The doctor also checks optional model-provider configuration. A missing provider or model can produce a `config` failure even when Chrome is attached; manual MCP tools do not require that configuration. Verify a small manual page read separately.

| Problem | Next step |
| --- | --- |
| `node` or `npx` cannot be found | Install Node and make its binaries available on Bot's MCP PATH, then reconnect the server. |
| Chrome or the extension is detached | Open Chrome on Bot's computer, enable FSB and follow its connection or pairing status. |
| Page content is unavailable | Open a normal HTTP or HTTPS page and reload it. Browser settings pages and the Chrome Web Store cannot be automated like ordinary sites. |
| FSB tools are missing or duplicated | Check the installed plugin and the effective `fsb` launch command; keep one intended connection active and reconnect it. |
| The plugin is unavailable or disabled by an admin | Check marketplace review status and your team's plugin policy; ask the administrator for access. |

See [FSB support](https://www.full-selfbrowsing.com/support) for the product's diagnostic flow. Report connection or approval failures without exposing credentials or claiming the browser task completed.

## Permissions and data flow

FSB acts with the authority of the browser profile on Bot's computer, including its signed in website sessions. Tools include DOM reads, JavaScript execution inside pages, authenticated application capabilities, credential and payment filling, file uploads, screenshots and replay. Page content is untrusted input. The skill provides usage guidance; it does not enforce a reduced server tool set.

Reading or drafting alone does not authorize sending, deleting, paying, granting access or changing credentials. The skill preserves the user's task scope and Bot's approvals. Passwords, tokens and payment data must stay out of prompts, tool arguments and summaries; vault values resolve inside the extension.

The extension requests tab and window access, scripting and broad site access, storage, debugging for trusted input, clipboard writing, navigation and supporting browser permissions, plus native messaging for an optional local service. Installing this plugin does not install the optional native host or enable HTTP serving. The npm package includes optional local CLI delegation and native-host components; those features are separate from manual browser tool use.

Requested page content and screenshots return to Bot and may reach its model. The extension-to-server bridge is local to Bot's computer, while Bot and its model processing can be hosted remotely.

## Network and privacy

The shared product policy is the [FSB Privacy Policy](https://www.full-selfbrowsing.com/privacy).

| Destination | Purpose |
| --- | --- |
| npm registry infrastructure, including `registry.npmjs.org` and registry-provided package URLs | Download the pinned MCP package and dependencies |
| Loopback WebSocket port `7225` on Bot's computer | Connect the MCP server to the FSB extension |
| Websites and application APIs selected for the task | Browser operations using that profile's session |
| `https://full-selfbrowsing.com/api/telemetry/events` | Extension anonymous usage telemetry, enabled by default; disable **Send anonymous usage data** in Advanced Settings |
| `https://full-selfbrowsing.com/api/auth/register` and `wss://full-selfbrowsing.com/ws` | Extension dashboard registration and relay connection; PhantomStream live preview belongs to the dashboard feature |
| `api.x.ai`, `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`, `openrouter.ai`, or the configured LM Studio/custom endpoint | Optional FSB AI features use the provider the user configures; LM Studio defaults to `http://localhost:1234` on that computer |

Anonymous telemetry is separate from the dashboard relay. The policy describes usage fields, coarse region, retention and erasure. Relay connection timing depends on the installed extension build; disabling telemetry does not necessarily disconnect dashboard networking.

If separately enabled, HTTP serving uses loopback port `7226`. This plugin selects stdio and does not expose an HTTP endpoint. Browser pairing state, local session recordings and screenshot files are described in the product policy. [FSB source](https://github.com/fullselfbrowsing/FSB) contains the extension and published server implementation.

## License

[MIT](LICENSE), with Full Self Browsing's original attribution retained.
