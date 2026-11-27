# 0004. System font for text, Poppins only in the wordmark, Space Mono for technical text

- Status: Superseded by 0012
- Date: 2026-11-24

Superseded by [0012](0012-platform-mono-for-technical-text.md): technical text now uses the platform monospace stack. The system-font and Poppins rules carry over into 0012 unchanged.

## Context and problem statement

FSB needs readable text in a browser extension, on a marketing site and inside other people's pages, in eight locales. It also has a typographic wordmark: a hairline F, a black S and a hand-drawn B.

## Considered options

1. Native system stack for all readable text, Poppins only for the wordmark (weights 100 and 900), and Space Mono for code, tokens, version tags, eyebrows and technical chips.
2. A web font for body text as well.
3. One family for everything, including the wordmark.

## Decision outcome

Chosen option 1. System fonts cost nothing to load, match each platform and cover CJK and Cyrillic locales. Poppins appears only where the brand signs a surface. Space Mono marks text that is literal: a selector, a tool name, a version. The research pages may use a display family of their own: concierge, lattice and phantom-stream import Outfit. That is a recorded exception, not a precedent.

## Consequences

- The extension bundles the faces it needs: Poppins 100 and 900, Space Mono 400 and 700 under `extension/assets/onboarding/fonts/`.
- The showcase must serve the same faces from its own origin. Its Content-Security-Policy allows stylesheets only from `'self'` and fonts only from `'self'` and `data:`. The Google Fonts imports on four research pages are therefore blocked, and no page loads Poppins or Space Mono any other way. Until PR #173 the wordmark's F and S fell back to the system font; they now come from `data:` faces in `fsb-wordmark.css`. Every Space Mono label still falls back. This is listed in [DESIGN.md](../../DESIGN.md), Known gaps.
- Monospace stacks differ today. options.css puts SF Mono first and leaves out Space Mono. The ratchet in `scripts/check-style-literals.mjs` counts literal `font-family` stacks, so this can only improve.

## Evidence

- [extension/ui/onboarding.css](../../extension/ui/onboarding.css) `@font-face` rules
- [showcase/server/server.js](../../showcase/server/server.js) the Content-Security-Policy header (`font-src`)
- [showcase/angular/src/styles/fsb-wordmark.css](../../showcase/angular/src/styles/fsb-wordmark.css) `.fsb-f`, `.fsb-s`, `.fsb-b`
- [design-system/foundations/typography.md](../foundations/typography.md)
