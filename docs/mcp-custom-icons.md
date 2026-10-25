# Custom FSB icons across MCP clients

Researched: 2026-10-14. Scope: all 21 client targets in `mcp/src/platforms.ts`, plus additional desktop, web, browser, and plugin surfaces. This is a documentation and source review, not an installation test of every client version. The client ecosystem is open-ended; this is a coverage matrix for the named targets, not a claim to cover every MCP application.

The repository observations and recommendations below describe the state before MCP 0.11.2. The implemented release ships the unchanged dark logo through runtime and registry metadata; see the [MCP changelog](../mcp/CHANGELOG.md#v0.11.2).

FSB can advertise its own logo through MCP today. Whether the logo appears depends on the client and the particular UI. VS Code explicitly supports protocol icons. Claude's plain local-server route is still reported to show a monogram; Claude Desktop has a separate, documented MCPB extension-icon route. Cursor and OpenAI also have plugin branding routes.

## Four different icon channels

| Channel | Where FSB puts the image | What it controls |
|---|---|---|
| MCP runtime identity | `serverInfo.icons` in the initialization response used by FSB's current SDK | Server branding in clients that render protocol metadata. Individual tools have their own `icons`. |
| MCP Registry | Top-level `icons` in `mcp/server.json` | Registry and gallery presentation; publishing metadata does not change runtime responses. |
| Packages and listings | MCPB `manifest.json`, plugin manifests, or a directory upload | Package, plugin, or catalog branding. It does not establish branding on every tool call. |
| Client configuration | For example LibreChat `iconPath` or Cherry Studio `logoUrl` | A logo chosen by the user or administrator of that client. |

The [MCP icon specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/index#icons) defines optional image metadata; it does not require every client to display it. The [schema](https://modelcontextprotocol.io/specification/2025-11-25/schema) attaches icons to implementations, tools, prompts, and resources. A Chrome extension's toolbar icon is another independent channel.

## All FSB installer targets

**Documented** means an official feature or schema establishes a route. **Source** describes the specific source snapshot inspected. **Reported** means a first-hand issue report, not a vendor guarantee. **Unverified** means the checked documentation does not establish custom icon support; it is not proof that the feature is absent.

| FSB target | Result for a custom FSB icon | Evidence and limits |
|---|---|---|
| Claude Desktop | **Reported:** plain `claude_desktop_config.json` servers retain a letter or generic icon. **Documented alternative:** MCPB extension icon. | The [open icon request](https://github.com/anthropics/claude-code/issues/95558) covers Desktop and Code. MCPB branding is covered separately below. |
| Claude Code | **Reported:** protocol icons are not rendered in the requested tool-list/permission surfaces. A plugin directory icon is a separate feature. | [Icon request](https://github.com/anthropics/claude-code/issues/95558). The [plugin manifest reference](https://code.claude.com/docs/en/plugins-reference) explicitly says Claude Code ignores the directory `icon` field at load time. |
| Cursor | **Documented:** `.cursor-plugin/plugin.json` supports `logo` for plugin branding. Protocol rendering for a plain custom MCP server is **unverified**. | [Plugin reference](https://prod.cursor.com/docs/reference/plugins), [MCP configuration](https://prod.cursor.com/docs/mcp). A relative logo path resolves to a GitHub raw-content URL. |
| VS Code / Copilot Chat in VS Code | **Documented:** server, resource, and tool protocol icons. | [MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp#icons). Use a PNG data URI for local stdio. A server logo does not promise identical placement on every tool-call UI. |
| Windsurf / Devin Desktop Cascade | **Unverified:** no custom protocol-icon contract found in the checked MCP guide. | [Cascade MCP guide](https://docs.devin.ai/desktop/cascade/mcp). Product/store artwork alone does not establish `serverInfo.icons` support. |
| Cline | **Documented:** marketplace entry `icon`. **Source:** inspected installed-server row does not render a server image. | [Marketplace format](https://github.com/cline/marketplace/blob/main/README.md), [installed row source](https://github.com/cline/cline/blob/789f79e46d3ba579717e8dc8be35fe28af935b06/apps/vscode/webview-ui/src/components/mcp/configuration/tabs/installed/server-row/ServerRow.tsx). Catalog branding and installed-server branding differ. |
| Zed | **Unverified:** no server-logo setting or protocol rendering guarantee in the checked MCP guide. | [MCP guide](https://zed.dev/docs/ai/mcp). Zed icon themes concern editor/file icons and are not evidence of MCP server logos. |
| Codex CLI | **Unverified** for ordinary MCP server icons in the terminal UI. OpenAI plugin branding is documented separately below. | [Official OpenAI MCP documentation](https://developers.openai.com/codex/mcp) documents shared configuration and `/mcp`, without promising a graphical server avatar. |
| Gemini CLI | **Unverified:** no custom server-image rendering contract in the checked guide. | [MCP server guide](https://geminicli.com/docs/tools/mcp-server/). Terminal status symbols are not custom bitmap branding. |
| Continue | **Unverified:** no icon option or rendering promise in the checked configuration guide. | [MCP setup](https://docs.continue.dev/customize/deep-dives/mcp). |
| Roo Code | **Unverified:** no custom server-logo route established by the checked documentation. | [MCP overview](https://roocodeinc.github.io/Roo-Code/features/mcp/overview/). Do not infer protocol support from its VS Code host. |
| Kilo Code | **Unverified:** no icon field or protocol rendering contract in the checked configuration guide. | [Using MCP](https://kilo.ai/docs/automate/mcp/using-in-kilo-code). Its current configuration differs from historical Roo-derived versions, so version-specific testing matters. |
| Goose | **Source:** inspected installed-extension card renders a title, description, and controls, without a server logo. Other surfaces remain **unverified**. | [ExtensionItem source](https://github.com/aaif-goose/goose/blob/9686d674000a5fbb8139214863289e4820714771/ui/desktop/src/components/settings/extensions/subcomponents/ExtensionItem.tsx). Support for interactive MCP UI is not itself icon support. |
| Amazon Q | **Unverified:** custom icon support was not established. The old Amazon Q CLI documentation URL now redirects to the general Q guide. | [Amazon Q documentation](https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/), [Kiro MCP configuration](https://kiro.dev/docs/mcp/configuration/). Check the actual Q/Kiro product and version before making a UI promise. |
| Amp | **Unverified:** no icon customization contract in the checked MCP guide. | [MCP documentation](https://ampcode.com/docs/customize/mcp). |
| BoltAI | **Unverified:** no MCP server-icon field documented in the checked guide. | [MCP Servers](https://docs.boltai.com/docs/plugins/mcp-servers). BoltAI's customizable application icon is unrelated to an FSB server icon. |
| OpenCode | **Unverified:** no server-icon field or display contract in the checked MCP configuration guide. | [MCP servers](https://opencode.ai/docs/mcp-servers/). |
| JetBrains AI Assistant | **Unverified:** no custom MCP logo contract in the checked guide. | [MCP documentation](https://www.jetbrains.com/help/ai-assistant/mcp.html). VS Code/Copilot behavior should not be extrapolated to this client. |
| ChatGPT | **Documented:** plugin/app listing and composer icons through OpenAI presentation metadata. Rendering of ordinary custom-MCP tool chips from `serverInfo.icons` alone is **unverified**. | [Package your plugin](https://developers.openai.com/plugins/build/plugins), [submission and icon requirements](https://developers.openai.com/plugins/deploy/submission). |
| Claude.ai | **Reported:** custom remote connectors ignore protocol icons; favicon behavior has limitations. **Documented:** directory icon upload. | [Protocol-icon issue](https://github.com/anthropics/claude-ai-mcp/issues/152), [connector submission](https://claude.com/docs/connectors/building/submission). Details below. |
| Warp | **Documented:** gallery entries can have product icons. Custom-server protocol rendering or a user-configurable image field is **unverified**. | [2026 changelog](https://docs.warp.dev/changelog/2026/) records a You.com gallery icon; [MCP guide](https://docs.warp.dev/agents/capabilities/mcp/) does not establish an FSB branding route. |

## Additional surfaces and clients

| Surface | Available route | What is established |
|---|---|---|
| Claude Desktop MCPB extension | Bundle `icon.png` and reference `icon`; optional themed/sized `icons`. | **Documented package branding.** Transparent PNG, 512×512 recommended and 256×256 minimum. Verify the connector menu and tool-call chip separately in a live client. [MCPB guide](https://claude.com/docs/connectors/building/mcpb). |
| Anthropic directory plugin | `plugin.json` `icon`, or a remote connector icon uploaded through the portal. | **Documented listing branding.** Claude Code does not consume the plugin listing icon at runtime. [Plugin reference](https://code.claude.com/docs/en/plugins-reference), [connector submission](https://claude.com/docs/connectors/building/submission). |
| OpenAI plugins in ChatGPT / Codex app and IDE surfaces | `extensions.com.openai.interface.logo` and `composerIcon`, with optional dark variants; compatibility `.codex-plugin/plugin.json` is also supported. | **Documented listing/composer branding.** This is a plugin route, not proof of an icon on every plain-MCP tool call. [Packaging](https://developers.openai.com/plugins/build/plugins), [submission](https://developers.openai.com/plugins/deploy/submission). |
| Claude in Chrome | Uses Claude/Cowork plugins and connectors where the Cowork side panel is available. | **Documented connector availability; no separate third-party icon API established.** Icon behavior must be checked in that surface. [Current Chrome guide](https://support.claude.com/en/articles/12012173-get-started-with-claude-in-chrome). |
| LibreChat | Per-server `iconPath` in `librechat.yaml`. | **Documented** custom display icon in tool selection. An administrator can configure FSB's image. [MCP object reference](https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers). |
| Cherry Studio | Per-server `logoUrl`; MCPB import also maps a bundle icon into it. | **Source:** the server card displays `server.logoUrl`. Automatic consumption of runtime protocol icons was not established. [Server card](https://github.com/CherryHQ/cherry-studio/blob/aeee284421ca7c3639a7929e804048e62de3e620/src/renderer/pages/settings/McpSettings/McpServerCard.tsx), [MCPB import](https://github.com/CherryHQ/cherry-studio/blob/aeee284421ca7c3639a7929e804048e62de3e620/src/renderer/pages/settings/McpSettings/AddMcpServerModal.tsx). |
| Open WebUI | Native MCP integration documented; custom protocol logo route **unverified**. | [MCP integration](https://docs.openwebui.com/features/extensibility/mcp/). OpenAPI/`mcpo` integration and MCP runtime metadata should not be assumed equivalent. |
| LM Studio | MCP connections documented; custom protocol logo route **unverified**. | [Use MCP Servers](https://lmstudio.ai/docs/app/mcp). |
| Msty Studio | Local and remote MCP tools documented; custom server-logo route **unverified**. | [Tools guide](https://docs.msty.ai/studio/toolbox/tools). |
| GitHub Copilot standalone app | **Reported:** ignores a local PNG `serverInfo.icons` and displays a generic paperclip. | [Issue #3473](https://github.com/github/app/issues/3473), app version 1.1.14 on Windows. This is distinct from Copilot Chat inside VS Code. The report incorrectly labels icons as part of the 2025-06 specification; its UI observation remains a report, not a protocol reference. |

## Repository state before MCP 0.11.2

- [`mcp/src/server.ts`](../mcp/src/server.ts) sends only `name` and `version`; no runtime icon.
- [`mcp/server.json`](../mcp/server.json) has neither `icons` nor `websiteUrl`.
- [`mcp/package.json`](../mcp/package.json) pins `@modelcontextprotocol/sdk` to 1.29.0. Inspection of that exact package confirms that its implementation schema accepts `icons`, `title`, `description`, and `websiteUrl`, and its initialization response forwards the server identity. **No SDK upgrade is needed for a server icon.**
- In that SDK's high-level `registerTool` and `registerPrompt` implementation, icon metadata is not included in the list response. Adding an `icons` property with a type cast will not fix that. Separate tool icons require a supported SDK API or deliberate lower-level handling; neither is needed for the first server-branding change.
- [`plugins/grok-bot/.cursor-plugin/plugin.json`](../plugins/grok-bot/.cursor-plugin/plugin.json) **already declares** `"logo": "assets/logo.png"`. That existing Cursor plugin route should be verified before creating another branding manifest.
- `extension/assets/icon128.png` is a 128×128 PNG, 2,402 bytes. The public [128px asset](https://www.full-selfbrowsing.com/assets/icon128.png) returned actual PNG bytes and `image/png`, not merely an HTTP 200 HTML page. A 512×512 mark also exists at `showcase/assets/lattice/logo-mark-dark.png`; theme suitability needs visual review before reuse.

## Recommended implementation

### 1. Advertise a small PNG through the existing server identity

Use the existing 128px asset embedded as a data URI, with a readable title and the FSB website. The raw image adds roughly 3.2 KB after base64 encoding. An illustrative change to the first constructor argument is:

```ts
{
  name: FSB_SERVER_NAME,
  title: 'Full Self Browsing',
  version: FSB_MCP_VERSION,
  description: 'Control the FSB browser extension from an MCP client.',
  websiteUrl: 'https://www.full-selfbrowsing.com',
  icons: [{
    src: fsbIconDataUri, // Embed the PNG in the shipped build.
    mimeType: 'image/png',
  }],
}
```

This snippet is a proposal; `fsbIconDataUri` has not been added to production code. Preserve the existing capability declarations. Omitting optional `sizes` is a compatibility choice for clients using early draft schemas; if included, the current protocol shape is an array such as `["128x128"]`, not a string. [MCP schema](https://modelcontextprotocol.io/specification/2025-11-25/schema).

**Why data URI:** VS Code's inspected implementation rejects HTTP(S) icon URLs for a stdio launch, accepts embedded data, and restricts HTTP-server images to the server authority. Its current allowed image formats exclude SVG. A small PNG data URI therefore avoids two concrete compatibility problems. [Pinned VS Code icon implementation](https://github.com/microsoft/vscode/blob/ae0b75378ee90ffeb9606f5abaa0a833777718ff/src/vs/workbench/contrib/mcp/common/mcpIcons.ts).

The protocol's security guidance favors HTTPS/data and rejects `file:`; VS Code documents a client-specific `file:` exception for stdio. FSB should use data rather than depend on that exception. [MCP security guidance](https://modelcontextprotocol.io/specification/2025-11-25/basic/index#icons), [VS Code guide](https://code.visualstudio.com/api/extension-guides/ai/mcp#icons).

### 2. Add registry metadata separately

The current registry schema supports `icons` and `websiteUrl`. Registry icons use HTTPS, so an embedded data URI is not appropriate there. An existing valid asset can be used immediately:

```json
{
  "websiteUrl": "https://www.full-selfbrowsing.com",
  "icons": [{
    "src": "https://www.full-selfbrowsing.com/assets/icon128.png",
    "mimeType": "image/png",
    "sizes": ["128x128"]
  }]
}
```

This is an additive fragment for the existing file. A dedicated 512px asset could replace it after hosting and validating the image. [Registry schema](https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json). VS Code's gallery may choose a GitHub preferred image or owner avatar ahead of registry icons, so publishing an icon does not guarantee that gallery selects it. [Gallery source](https://github.com/microsoft/vscode/blob/ae0b75378ee90ffeb9606f5abaa0a833777718ff/src/vs/platform/mcp/common/mcpGalleryService.ts).

### 3. Use packaging for the clients with separate branding contracts

- **Claude Desktop:** ship an MCPB with a suitable transparent PNG. This supplies documented extension branding. MCPB variants use singular `size: "512x512"`, unlike MCP's `sizes: ["512x512"]`. New MCPB directory submissions are deprecated; directory distribution of local servers uses plugins. [MCPB guide](https://claude.com/docs/connectors/building/mcpb), [manifest spec](https://github.com/modelcontextprotocol/mcpb/blob/main/MANIFEST.md).
- **Cursor:** retain and test the existing plugin `logo`. [Cursor reference](https://prod.cursor.com/docs/reference/plugins).
- **ChatGPT/Codex:** package `logo` and `composerIcon`, with optional dark variants. OpenAI requires square images of at least 48×48, at most 5 MiB; raster dimensions may not exceed 4096. [Official icon requirements](https://developers.openai.com/plugins/deploy/submission).
- **LibreChat/Cherry Studio:** provide client-specific configuration examples using their documented/source-backed fields. They are not portable MCP fields and should not be inserted into every client's configuration.

### 4. Verify the exact UI the user cares about

Check the installed-server list, connector/tool picker, permission prompt, and tool-call chip separately, in light and dark themes. Verify that FSB still connects and exposes its tools through both stdio and HTTP. A logo in one location is not evidence for the others.

For Claude.ai, reports describe ignored protocol icons, root-domain favicon lookup mistakes, and favicon snapshots that do not refresh. Reports also describe connection failures when adding `icons`; the original example includes an invalid string `sizes`, so the report does not establish a universal failure with valid metadata. A later commenter reports an independent A/B failure. Treat this as a specific compatibility test, not as proof that FSB must suppress all icons. [Ignored icons](https://github.com/anthropics/claude-ai-mcp/issues/152), [favicon lookup](https://github.com/anthropics/claude-ai-mcp/issues/838), [frozen favicon](https://github.com/anthropics/claude-ai-mcp/issues/882), [connection report](https://github.com/anthropics/claude-ai-mcp/issues/474).

## Corrections and limits relative to the handoff

1. **Claude in Chrome is relevant.** Current official docs say the Cowork side panel supports plugins and connectors. The handoff's “not applicable” finding is no longer adequate; no independent FSB icon API was established.
2. **MCPB branding is scoped.** Its documented extension icon should not be presented as a guarantee that the precise “F” tool-call avatar changes without a live test.
3. **Tool icons do not intrinsically require a major SDK upgrade.** FSB's high-level API omits them; a different supported API or lower-level implementation is also possible.
4. **A marketplace icon and a runtime icon differ.** This matters for Cursor, Cline, Warp, registry galleries, and both Anthropic and OpenAI plugins.
5. **Documentation silence is uncertainty.** The unverified rows need client/version-specific testing before advertising support or declaring permanent incompatibility.

The research phase changed only documentation. The subsequent MCP 0.11.2 implementation adds the packaged dark logo and icon metadata; it does not add bundles, plugin packages, hosting changes, or client configuration changes.
