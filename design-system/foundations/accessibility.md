# Accessibility

Visible focus, honest motion, reachable targets and readable text, in every theme and locale.

## Rules

- **Focus:**
  - **MUST** give every interactive element a visible focus state.
  - Product pages use `--fsb-focus-ring` (`0 0 0 3px` orange at 14%).
  - The site steps the border to orange.
  - **MUST NOT** remove focus outlines without a replacement.
- **MUST** honour `prefers-reduced-motion` for every transition and loop (see [motion.md](motion.md)).
- **Targets:** **SHOULD** make interactive targets at least 44×44px; new controls **MUST**. In the side panel the delegated-run actions and Stop are 44px, and tests pin `min-height: 44px` and `min-width: 44px` there. Its 32px header buttons and 36px composer buttons are older and smaller (a test pins the 36px), listed under Known gaps.
- **Names:** **MUST** give icon-only controls an `aria-label`, and label every form field with a real `<label>` or `aria-labelledby`.
- **Contrast:** **MUST** keep WCAG AA in both themes of each palette: 4.5:1 for text, 3:1 for large text and interface parts. Overlay text sits on the overlay's own dark card, never on page content.
- **MUST NOT** use colour alone to carry meaning. Overlay states also change text or shape; product messages carry a label or an icon.
- **Keyboard:**
  - **MUST** keep every action reachable by keyboard.
  - Depth pages answer the wheel, arrow keys and touch.
  - The element inspector toggles with Ctrl+Shift+E.
- **Secrets:** **MUST NOT** show secret values in any surface. **MUST NOT** collect secret input in page DOM or a shadow root (see [0009](../decisions/0009-secret-input-in-extension-frame.md)).

## Tokens

| Name | Value | Where it ships |
|---|---|---|
| `--fsb-focus-ring` | `0 0 0 3px rgba(255, 107, 53, 0.14)` | fsb-ui-core.css; styles.scss re-declares it |

## Specimens

None yet. The forms card shows focus styles: [forms](../components/forms/forms.card.html).

## Known gaps

- **No automated accessibility tests.** No axe or pa11y runs anywhere; accessibility is only pinned by source tests (aria labels, focus-visible, reduced-motion media queries).
- **Reduced motion is uneven.**
  - The popup has no reduced-motion handling, and the site has no global guard.
  - On web pages, the viewport glow keeps its bead loop running under reduced motion, as do the crawl card and the element highlight ([overlays](../surfaces/overlays.md)).
- **Overlay focus and targets:**
  - The status pill's Stop button can take keyboard focus inside an `aria-hidden` host.
  - Stop is 36px square (`.pl-stop` in `visual-feedback.js`), under the 44px that new controls must meet.
- **Weak site focus.** The site's focus treatment is a border colour change, which is weaker than a ring on dark backgrounds.
- **Small side-panel buttons.** The side panel's header buttons are 32px and its composer buttons 36px, under the 44px target.

## Evidence

- [fsb-ui-core.css](../../extension/shared/fsb-ui-core.css) `--fsb-focus-ring` and the `:focus` rules
- [sidepanel.css](../../extension/ui/sidepanel.css) the 44px minimums
- [tests/agent-provider-forbidden-flags.test.js](../../tests/agent-provider-forbidden-flags.test.js) (44px pins)
