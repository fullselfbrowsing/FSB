# 0006. Overlays render in shadow DOM and are promoted to the top layer

- Status: Accepted
- Date: 2026-11-24

## Context and problem statement

FSB draws on pages it does not control. Page CSS can restyle injected elements, page scripts can read or move them, and page dialogs and fixed headers can cover them.

## Considered options

1. Host each overlay in its own element with a shadow root, reset the host with `all: initial`, and promote the host to the top layer with `popover="manual"` and `showPopover()`. Fall back to `z-index: 2147483647` where popovers are unavailable.
2. Plain elements with high `z-index` and `!important` styles.
3. An iframe per overlay.

## Decision outcome

Chosen option 1. Shadow DOM isolates the styles in both directions. This is a Key Decision in `.planning/PROJECT.md`: "Complete style isolation from page CSS". The top layer keeps the overlays above page content without a z-index race. An iframe is reserved for input that must stay private from the page (see [0009](0009-secret-input-in-extension-frame.md)): keystrokes typed into a shadow root still reach page listeners.

## Consequences

- `@font-face` inside a shadow root is ignored. An overlay that needs a brand face registers it on the document or draws it as outlines.
- Each overlay declares its colours in its own shadow stylesheet. They are catalogued in [../tokens/overlay.css](../tokens/overlay.css).
- Hosts ignore pointer events, except where the user must click, such as Stop and the replay controls.

## Evidence

- [extension/content/visual-feedback.js](../../extension/content/visual-feedback.js) `promoteToTopLayer`, `ProgressOverlay`, `ViewportGlow`
- [.planning/PROJECT.md](../../.planning/PROJECT.md), Key Decisions: "Shadow DOM for visual overlays"
- [design-system/surfaces/overlays.md](../surfaces/overlays.md)
