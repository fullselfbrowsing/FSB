---
name: fsb-design
description: Use this skill to design or build anything people see in FSB (Full Self-Browsing), whether production UI in the extension or the showcase site, or a throwaway mock, prototype or slide. It holds FSB's design rules, tokens, palettes, type, motion, icons, voice and surface specs.
user-invocable: true
---

FSB's design system lives in the repository, not in this skill folder.

1. Read [DESIGN.md](../../../DESIGN.md) at the repository root first. It is the contract: the three palettes, the rules, the Do's and Don'ts and the known gaps.
2. Then read what the task touches:
   - [design-system/README.md](../../../design-system/README.md), the index;
   - the page for the surface you are changing, in [design-system/surfaces/](../../../design-system/surfaces/showcase.md);
   - the foundation pages in [design-system/foundations/](../../../design-system/foundations/color.md).
3. Take every value from a token of the surface's own palette:
   - site tokens in `design-system/tokens/colors.css` and its siblings;
   - product tokens `--fsb-*` in `design-system/tokens/product-surface.css`;
   - overlay tokens in `design-system/tokens/overlay.css`.

   The shipped files those mirror are `showcase/angular/src/styles.scss`, `extension/shared/fsb-ui-core.css` and `extension/content/visual-feedback.js`.

For production code, change the shipped file. If you change a token, change its design-system twin in the same edit. Run `npm run test:design` before you finish. Several shipped stylesheets are pinned by tests; the surface pages list them.

For visual artifacts (mocks, prototypes, slides), copy what you need from `design-system/assets/` and `design-system/styles.css` into a scratch folder outside the repository, such as `.context/`, and build static HTML there. Never write mocks or prototypes under `extension/` or `showcase/`, where they would ship.

If the user invokes this skill with no other guidance, ask what they want to build, ask a few questions, and act as a designer who delivers HTML artifacts or production code, as the need requires.
