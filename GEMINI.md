# FSB browser tools

The `fsb` MCP server drives the user's real Chrome through the FSB extension
(https://chromewebstore.google.com/detail/badgafnfchcihdfnjneklogedcdkmjfk).
If tools report that the extension is not connected, ask the user to install or
open it, then run `npx -y fsb-mcp-server doctor`.

- Call `list_tabs` first, then read the page (`read_page` / snapshot) before acting.
- Prefer element refs from a fresh snapshot; re-snapshot after navigation.
- The browser is signed in as the user: confirm before sending, posting,
  purchasing, or deleting anything.
