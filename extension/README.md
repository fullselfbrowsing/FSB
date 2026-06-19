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
| `content/` | DOM analysis, action execution, messaging, lifecycle, visual feedback, and PhantomStream-backed DOM streaming. |
| `ui/` | Popup, side panel, control panel, unlock screens, and shared UI behavior. |
| `ai/` | Provider integration, model discovery, tool registry, agent loop, transcripts, and state emitters. |
| `ws/` | WebSocket bridge client, PhantomStream protocol bridge, remote-control mapping, and MCP tool dispatcher. |
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

## DOM Streaming Boundary

FSB uses `@full-self-browsing/phantom-stream@0.1.0` for generic browser mirroring. `content/dom-stream.js` is an FSB adapter around the bundled PhantomStream capture bridge; `ws/ws-client.js` uses the PhantomStream protocol bridge for stream/control envelopes while preserving FSB task/status traffic and remote-control ownership diagnostics.

## Trigger Watchers

FSB can arm a reactive watch on one page element and report when a condition is met. MCP clients drive this through the `trigger`, `stop_trigger`, `get_trigger_status`, and `list_triggers` tools; the extension owns the watch lifecycle:

- **`live-observe`** runs an in-page mutation observer in the content script and reports changes without reloading the tab.
- **`refresh-poll`** reloads the owned tab in the background, reads the selector once the page is ready, and coalesces same-tab due watches into a single reload.
- Watches persist in `chrome.storage` and re-arm after MV3 service-worker eviction; they clean up on TTL expiry, tab close, explicit stop, timeout, or owner release.
- Conditions support `changed`, `threshold`, `delta_percent`, `equals`, `contains`, `regex`, and compound AND/OR, with hysteresis on numeric edges. A watch moves through the statuses `armed`, `needs_attention`, `blocked`, `fired`, `timed_out`, and `stopped`.
- Concurrency is bounded by `fsbTriggerCap` in the control panel (default 8, range 1–64). Armed and attention states count toward the cap; terminal states do not.

Triggers are local and notify-only: the browser and extension must stay open, and FSB sends no desktop/email/SMS push. See the [MCP server README](../mcp/README.md#trigger-watchers) for the full tool contract.

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
