# FSB Chrome Extension

`extension/` is the unpacked Chrome extension package for FSB v0.9.90. Load this directory, not the repository root, when running locally.

## Load Unpacked

1. Open `chrome://extensions` in Chrome or another Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the repository's `extension/` directory.
5. Pin FSB from the toolbar puzzle icon.
6. Open the popup from the toolbar, or right-click the extension and choose **Open side panel**.

After code changes, reload the extension from `chrome://extensions` and refresh any open tabs so content scripts re-inject.

## Key Entry Points

| Path | Role |
|------|------|
| `manifest.json` | MV3 manifest, permissions, entry points, and web-accessible resources. |
| `background.js` | Service worker for sessions, model calls, MCP bridge handling, storage, and orchestration. |
| `canvas-interceptor.js` | MAIN-world content script loaded at `document_start`. |
| `content/` | DOM analysis, action execution, messaging, lifecycle, visual feedback, and DOM streaming. |
| `ui/` | Popup, side panel, control panel, unlock screens, and shared UI behavior. |
| `ai/` | Provider integration, model discovery, tool registry, agent loop, transcripts, and state emitters. |
| `ws/` | WebSocket bridge client and MCP tool dispatcher. |
| `lib/` | Vendored libraries plus memory and visualization subsystems. |
| `site-guides/` | Domain and category-specific automation guidance. |
| `config/` | Defaults, migration, and secure encrypted configuration. |
| `assets/` | Icons, logos, and screenshots. |

## Validation

Run from the repository root:

```bash
npm run validate:extension
npm test
```

`validate:extension` checks manifest sanity and JavaScript syntax across the extension tree. The Node test suite covers extension modules that can run outside Chrome, including analytics, costs, transcript storage, tool routing, MCP bridge contracts, and regression cases.

## Debugging

- Inspect the service worker from `chrome://extensions` with **Inspect views: service worker**.
- Check the active tab console for content script logs.
- Use the options page log viewer for session history, action results, and warnings.
- If MCP calls fail, confirm the MCP bridge is connected and the active tab is not a restricted browser page.

## Manifest Notes

The extension declares permissions for tabs, scripting, storage, side panel, debugger-backed coordinate tools, web navigation, alarms, clipboard write, offscreen speech-to-text, and broad host access. Those permissions support supervised browser automation and should be reviewed when adding new public behavior.

## Local Data

The extension stores settings, encrypted keys, analytics, memory, logs, vault data, and legacy agent records in Chrome storage. Uninstalling the extension or clearing extension storage can remove that local state. Export settings from the control panel before destructive browser cleanup if you need to preserve local configuration.

## Public Surfaces

The extension is driven through:

- popup and side panel chat
- control panel settings and diagnostics
- content-script visual overlay
- local WebSocket bridge for `fsb-mcp-server`
- optional showcase/dashboard sync flows

## Packaging Note

Use `npm run package:extension` from the repository root to create a Chrome Web Store-ready archive at `dist/fsb-extension-v<version>.zip`. The archive contains the contents of `extension/` at the zip root, so `manifest.json` is not nested under an extra directory.

The legacy root `npm run package` command creates a repository-level zip and should not be used for Chrome Web Store submission packages.

See the root [README.md](../README.md) for full repo setup, MCP usage, and showcase deployment context.
