# 0009. Secret input on a web page goes in an extension frame, never in the page or a shadow root

- Status: Proposed
- Date: 2026-11-24

Proposed: built on the `onepassword-vault-replacement` branch (pull request #172), not yet on main. When it merges, set this record to Accepted.

## Context and problem statement

When an agent asks FSB to sign in and nothing is saved in 1Password, FSB has to let the person type a login on the page. The person must be able to do that without the page, its scripts or its session recorders seeing the keystrokes.

## Considered options

1. Fields inside an extension iframe (a web-accessible extension page), hosted in a closed shadow root promoted to the top layer.
2. Plain fields inside the overlay's closed shadow root.
3. Ask in the side panel only.

## Decision outcome

Chosen option 1. In a Chromium test, every key typed into an input inside a closed shadow root reached a listener on the page, even though the shadow root read as null. Keys typed into an extension frame reached nothing. Option 3 fails when the side panel is closed. Over MCP the side panel is usually closed, which today causes a two-minute wait.

## Consequences

- **Nonce.** The frame gets its nonce by `postMessage` to the extension origin, never in its URL. Pages can read iframe URLs from their resource-timing entries.
- **Values.** Typed values travel on a dedicated `chrome.runtime` port, not `runtime.sendMessage`, which would reach every extension context.
- **The sheet.** It pauses when the page takes focus. Sign-in stays off unless the sheet is fully visible. The site name comes from the tab URL, never from page text.
- **Values never shown.** No secret value is ever shown in any FSB surface.
- **Scope.** The full rules are in [../surfaces/vault.md](../surfaces/vault.md).

## Evidence

- Pull request #172 (branch `onepassword-vault-replacement`): `extension/ui/credential-sheet.html`, `extension/content/vault-pill.js`
- The "FSB · 1Password vault" design canvas, boards CredWhere and Security (see [../sources.md](../sources.md))
